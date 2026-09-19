package httpapi

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func TestHealthErrorsAndRedaction(t *testing.T) {
	var logs bytes.Buffer
	available := true
	s := New(platform.NewLogger(&logs, "info"), func(context.Context) error {
		if !available {
			return errors.New("postgres://secret:DO_NOT_LEAK@host/db")
		}
		return nil
	})
	s.App.Get("/panic", func(fiber.Ctx) error { panic("DO_NOT_LEAK") })
	for _, tc := range []struct {
		path   string
		status int
	}{
		{"/health/live", 200}, {"/health/ready", 200}, {"/api/v1/private?token=DO_NOT_LEAK", 404}, {"/panic", 500},
	} {
		req := httptest.NewRequest("GET", tc.path, nil)
		req.Header.Set("X-Request-ID", "DO_NOT_LEAK")
		resp, err := s.App.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != tc.status {
			t.Fatalf("%s: got %d", tc.path, resp.StatusCode)
		}
		if len(resp.Header.Get("X-Request-ID")) != 32 || strings.Contains(string(body), "DO_NOT_LEAK") {
			t.Fatal("unsafe response")
		}
	}
	available = false
	resp, err := s.App.Test(httptest.NewRequest("GET", "/health/ready", nil))
	if err != nil || resp.StatusCode != 503 {
		t.Fatal("unavailable DB did not fail readiness")
	}
	resp.Body.Close()
	available = true
	s.Draining.Store(true)
	resp, err = s.App.Test(httptest.NewRequest("GET", "/health/ready", nil))
	if err != nil || resp.StatusCode != 503 {
		t.Fatal("drain did not fail readiness")
	}
	resp.Body.Close()
	if strings.Contains(logs.String(), "DO_NOT_LEAK") {
		t.Fatal("request/panic/DB details leaked into logs")
	}
}

package listingimages

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
)

type fixtureAuth struct{ mutationCalls int }

func (*fixtureAuth) RequireSession(fiber.Ctx, context.Context) (auth.SessionView, error) {
	return auth.SessionView{}, nil
}
func (a *fixtureAuth) RequireMutationSession(fiber.Ctx, context.Context) (auth.SessionView, error) {
	a.mutationCalls++
	return auth.SessionView{Member: auth.Member{ID: "member-a"}}, nil
}

func TestImageHTTPContract(t *testing.T) {
	app := fiber.New()
	r := &fakeRepo{}
	a := &fixtureAuth{}
	h := Register(app, nil, nil, &fakeStorage{uploadURL: "https://fixture.invalid/upload?token=x"}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	h.Auth = a
	h.Service.Repo = r
	for _, tc := range []struct {
		method, path, body string
		status             int
	}{
		{"GET", "/api/v1/listings/listing-a/images", "", 200},
		{"POST", "/api/v1/listings/listing-a/images/uploads", `{"mimeType":"image/png","fileSizeBytes":20,"sortOrder":0}`, 201},
		{"POST", "/api/v1/listings/listing-a/images/uploads", `{"mimeType":"image/png","fileSizeBytes":20,"sortOrder":0,"memberId":"other"}`, 400},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		var body map[string]any
		err = json.NewDecoder(resp.Body).Decode(&body)
		resp.Body.Close()
		if err != nil || resp.StatusCode != tc.status {
			t.Fatalf("%s: %d %v", tc.path, resp.StatusCode, err)
		}
		if tc.method == "GET" {
			if images, ok := body["images"].([]any); !ok || len(images) != 0 {
				t.Fatal("images must be []")
			}
		}
	}
	if a.mutationCalls != 2 || r.beginCalls != 1 || r.lastMember != "member-a" {
		t.Fatal("mutation ownership or validation bypassed")
	}
}

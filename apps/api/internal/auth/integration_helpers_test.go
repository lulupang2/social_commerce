//go:build integration && authfixture

package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/authfixture"
	"github.com/lulupang2/social_commerce/apps/api/internal/httpapi"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

type lockedBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.b.Write(p)
}
func (b *lockedBuffer) String() string { b.mu.Lock(); defer b.mu.Unlock(); return b.b.String() }

type harness struct {
	cfg                Config
	handler            *Handler
	app                *fiber.App
	fixture            *authfixture.Server
	admin, worker, api *pgxpool.Pool
	logs               *lockedBuffer
}

func authPools(t *testing.T) map[platform.Role]*pgxpool.Pool {
	t.Helper()
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" || os.Getenv("DB_TARGET") != "fixture" || os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("authentication integration requires the explicit isolated fixture")
	}
	pools := map[platform.Role]*pgxpool.Pool{}
	for _, role := range []platform.Role{platform.API, platform.Worker, platform.Migration} {
		cfg, err := platform.LoadConfig(role, "")
		require(t, err)
		pool, err := platform.OpenDatabase(context.Background(), cfg)
		require(t, err)
		pools[role] = pool
		t.Cleanup(pool.Close)
	}
	return pools
}
func newHarness(t *testing.T, pools map[platform.Role]*pgxpool.Pool) *harness {
	t.Helper()
	cfg, err := parseValues(configValues())
	require(t, err)
	fixture, err := authfixture.New("", cfg.PublicURL)
	require(t, err)
	provider := httptest.NewServer(fixture)
	fixture.BaseURL = provider.URL
	t.Cleanup(provider.Close)
	cfg.FixtureBase = provider.URL
	cfg.HTTPTimeout = time.Second
	logs := &lockedBuffer{}
	logger := platform.NewLogger(logs, "info")
	app := httpapi.New(logger, func(ctx context.Context) error { return (&Store{pools[platform.API], cfg}).Ready(ctx) }).App
	h := &harness{cfg: cfg, fixture: fixture, app: app, admin: pools[platform.Migration], worker: pools[platform.Worker], api: pools[platform.API], logs: logs}
	h.handler = Register(app, cfg, h.api, logger)
	return h
}
func require(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
func (h *harness) request(t *testing.T, method, path string, cookies map[string]string, body string, headers map[string]string) (*http.Response, []byte) {
	t.Helper()
	req := httptest.NewRequest(method, h.cfg.PublicURL+path, strings.NewReader(body))
	for k, v := range cookies {
		req.AddCookie(&http.Cookie{Name: k, Value: v})
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := h.app.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
	require(t, err)
	data, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	require(t, err)
	for _, cookie := range resp.Cookies() {
		if cookies != nil {
			if cookie.MaxAge < 0 {
				delete(cookies, cookie.Name)
			} else {
				cookies[cookie.Name] = cookie.Value
			}
		}
	}
	return resp, data
}
func duplicateCookies(in map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range in {
		out[k] = v
	}
	return out
}
func (h *harness) start(t *testing.T, name string, cookies map[string]string) string {
	t.Helper()
	resp, _ := h.request(t, "GET", Prefix+"/"+name+"/start", cookies, "", nil)
	if resp.StatusCode != 303 {
		t.Fatalf("login start returned %d", resp.StatusCode)
	}
	return h.authorize(t, resp.Header.Get("Location"))
}
func (h *harness) authorize(t *testing.T, address string) string {
	t.Helper()
	client := http.Client{Timeout: 2 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Get(address)
	require(t, err)
	resp.Body.Close()
	if resp.StatusCode != 303 {
		t.Fatalf("provider authorize returned %d", resp.StatusCode)
	}
	callback, err := url.Parse(resp.Header.Get("Location"))
	require(t, err)
	return callback.RequestURI()
}
func (h *harness) finish(t *testing.T, path string, cookies map[string]string) SessionView {
	t.Helper()
	resp, _ := h.request(t, "GET", path, cookies, "", nil)
	if resp.StatusCode != 303 || resp.Header.Get("Location") != TestPath+"?auth=success" {
		t.Fatalf("callback failed: %d %s", resp.StatusCode, resp.Header.Get("Location"))
	}
	for _, cookie := range resp.Cookies() {
		if cookie.Name == h.cfg.SessionCookie() && (!cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode || cookie.Domain != "" || cookie.Path != "/") {
			t.Fatal("unsafe session cookie")
		}
	}
	resp, data := h.request(t, "GET", Prefix+"/session", cookies, "", nil)
	if resp.StatusCode != 200 {
		t.Fatalf("session lookup failed: %d", resp.StatusCode)
	}
	var view SessionView
	require(t, json.Unmarshal(data, &view))
	return view
}
func (h *harness) login(t *testing.T, name, subject string, cookies map[string]string) SessionView {
	t.Helper()
	h.fixture.SetSubject(name, subject)
	return h.finish(t, h.start(t, name, cookies), cookies)
}
func (h *harness) mutationHeaders(view SessionView) map[string]string {
	return map[string]string{"Origin": h.cfg.PublicURL, "X-CSRF-Token": view.CSRFToken}
}
func appFiles(t *testing.T) []migrate.File {
	t.Helper()
	files, err := migrate.LoadFiles("/workspace/supabase/migrations")
	require(t, err)
	return files
}
func readyAuthPools(t *testing.T) map[platform.Role]*pgxpool.Pool {
	t.Helper()
	pools := authPools(t)
	_, err := migrate.Run(context.Background(), pools[platform.Migration], appFiles(t), true, platform.NewLogger(io.Discard, "error"))
	require(t, err)
	return pools
}

//go:build authfixture

package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/lulupang2/social_commerce/apps/api/internal/authfixture"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

type oauthAttempt struct{ code, state, verifier, nonce string }

func setupProvider(t *testing.T, name string) (*Provider, *authfixture.Server) {
	t.Helper()
	c, err := parseValues(configValues())
	if err != nil {
		t.Fatal(err)
	}
	fixture, err := authfixture.New("", c.PublicURL)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(fixture)
	fixture.BaseURL = server.URL
	t.Cleanup(server.Close)
	c.FixtureBase = server.URL
	c.HTTPTimeout = time.Second
	return NewProvider(c.Providers[name], c), fixture
}
func authorizeAttempt(t *testing.T, p *Provider, reauth bool) oauthAttempt {
	t.Helper()
	a := oauthAttempt{}
	var err error
	for _, dst := range []*string{&a.state, &a.verifier, &a.nonce} {
		*dst, err = randomToken()
		if err != nil {
			t.Fatal(err)
		}
	}
	address := p.Authorize(a.state, a.verifier, a.nonce, reauth)
	parsed, _ := url.Parse(address)
	q := parsed.Query()
	if q.Get("code_challenge") != pkceChallenge(a.verifier) || q.Get("code_challenge_method") != "S256" || q.Get("scope") != "openid" {
		t.Fatal("missing PKCE/OIDC authorization parameters")
	}
	if reauth && (p.cfg.Name == "naver" && q.Get("auth_type") != "reauthenticate" || p.cfg.Name == "kakao" && q.Get("prompt") != "login") {
		t.Fatal("provider reauthentication not requested")
	}
	client := http.Client{Timeout: 2 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Get(address)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 303 {
		t.Fatalf("fixture authorization status %d", resp.StatusCode)
	}
	callback, err := url.Parse(resp.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	if callback.Query().Get("state") != a.state {
		t.Fatal("state changed")
	}
	a.code = callback.Query().Get("code")
	return a
}
func exchange(t *testing.T, p *Provider, a oauthAttempt) (Identity, error) {
	t.Helper()
	return p.Exchange(context.Background(), a.code, a.state, a.verifier, a.nonce, time.Time{})
}
func TestRealAdaptersThroughOAuthHTTP(t *testing.T) {
	for _, name := range []string{"naver", "kakao"} {
		t.Run(name, func(t *testing.T) {
			p, fixture := setupProvider(t, name)
			a := authorizeAttempt(t, p, false)
			identity, err := exchange(t, p, a)
			if err != nil || identity.Provider != name || identity.Subject != "fixture-"+name+"-member" || identity.Email == nil {
				t.Fatalf("real adapter success failed: %v", err)
			}
			if _, err = exchange(t, p, a); !errors.Is(err, errCode) {
				t.Fatal("provider code reuse was accepted")
			}
			fixture.SetMode("no-email")
			a = authorizeAttempt(t, p, false)
			identity, err = exchange(t, p, a)
			if err != nil || identity.Email != nil {
				t.Fatal("email unexpectedly required")
			}
			fixture.SetMode("")
			a = authorizeAttempt(t, p, true)
			if _, err = p.Exchange(context.Background(), a.code, a.state, a.verifier, a.nonce, time.Now()); err != nil {
				t.Fatal("explicit reauth failed")
			}
			fixture.SetMode("no-nonce")
			a = authorizeAttempt(t, p, false)
			_, err = exchange(t, p, a)
			if name == "naver" && err != nil || name == "kakao" && err == nil {
				t.Fatal("provider-specific nonce policy violated")
			}
			fixture.SetMode("")
			a = authorizeAttempt(t, p, false)
			a.verifier, _ = randomToken()
			if _, err = exchange(t, p, a); !errors.Is(err, errCode) {
				t.Fatal("bad PKCE accepted")
			}
		})
	}
}
func TestProviderFailureMatrix(t *testing.T) {
	p, fixture := setupProvider(t, "kakao")
	for _, tc := range []struct {
		mode string
		want error
	}{
		{"outage", errProvider}, {"invalid-code", errCode}, {"timeout", errTimeout}, {"bad-json", errResponse}, {"oversized", errResponse},
		{"redirect", errResponse}, {"bad-issuer", errResponse}, {"bad-audience", errResponse}, {"expired", errResponse},
		{"future-issued", errResponse}, {"bad-nonce", errResponse}, {"no-subject", errResponse}, {"bad-at-hash", errResponse},
		{"bad-algorithm", errResponse}, {"bad-signature", errResponse}, {"userinfo-mismatch", errResponse}, {"userinfo-outage", errProvider},
	} {
		t.Run(tc.mode, func(t *testing.T) {
			fixture.SetMode(tc.mode)
			_, err := exchange(t, p, authorizeAttempt(t, p, false))
			if !errors.Is(err, tc.want) {
				t.Fatalf("got %v, expected %v", err, tc.want)
			}
		})
	}
	fixture.SetMode("")
	if err := fixture.Rotate(); err != nil {
		t.Fatal(err)
	}
	p.mu.Lock()
	p.fetched = time.Now().Add(-time.Minute)
	p.mu.Unlock()
	if _, err := exchange(t, p, authorizeAttempt(t, p, false)); err != nil {
		t.Fatal("JWKS rotation failed")
	}
}
func TestFixtureBuildRejectsHostedTarget(t *testing.T) {
	v := configValues()
	v["AUTH_FIXTURE_HTTP"] = "true"
	v["AUTH_FIXTURE_OAUTH_BASE_URL"] = "http://oauthfixture:18090"
	_, err := ParseConfig(func(k string) string { return v[k] }, platform.Config{Target: "supabase-test", TargetID: "not-a-disposable-database"})
	if err == nil {
		t.Fatal("mock provider accepted against Supabase")
	}
	v["PUBLIC_WEB_URL"] = "http://web:3000"
	v["NAVER_REDIRECT_URI"] = "http://web:3000/api/v1/auth/naver/callback"
	v["KAKAO_REDIRECT_URI"] = "http://web:3000/api/v1/auth/kakao/callback"
	if _, err = parseValues(v); err != nil {
		t.Fatal("valid isolated fixture rejected", err)
	}
}

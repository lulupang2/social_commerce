package auth

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func configValues() map[string]string {
	return map[string]string{
		"APP_ENV": "test", "PUBLIC_WEB_URL": "https://app.example.invalid", "AUTH_DEV_LOGIN_ENABLED": "true",
		"NAVER_CLIENT_ID": "fixture-naver", "NAVER_CLIENT_SECRET": "fixture-secret-naver", "NAVER_REDIRECT_URI": "https://app.example.invalid/api/v1/auth/naver/callback",
		"KAKAO_CLIENT_ID": "fixture-kakao", "KAKAO_CLIENT_SECRET": "fixture-secret-kakao", "KAKAO_REDIRECT_URI": "https://app.example.invalid/api/v1/auth/kakao/callback",
	}
}
func parseValues(v map[string]string) (Config, error) {
	return ParseConfig(func(k string) string { return v[k] }, platform.Config{Target: "fixture", TargetID: platform.FixtureID})
}
func TestOptionalProvidersAndSafeDefaults(t *testing.T) {
	c, err := parseValues(map[string]string{})
	if err != nil || c.Enabled() {
		t.Fatal("absent providers must not prevent health-only startup")
	}
	if c.IdleTTL != 30*time.Minute || c.AbsoluteTTL != 168*time.Hour || c.SessionCookie() != "__Host-sg_session" || c.DevLogin {
		t.Fatal("unsafe default policy")
	}
	values := configValues()
	delete(values, "KAKAO_CLIENT_SECRET")
	c, err = parseValues(values)
	if err != nil || !c.Providers["naver"].Enabled || c.Providers["kakao"].Enabled {
		t.Fatal("provider configuration is not independent")
	}
	data, _ := json.Marshal(c.Statuses())
	if strings.Contains(string(data), "fixture-secret") || !strings.Contains(string(data), "KAKAO_CLIENT_SECRET") {
		t.Fatal("configuration diagnostic leaked values or omitted names")
	}
}
func TestConfigurationAndReturnPathGuards(t *testing.T) {
	for _, tc := range []struct{ key, value string }{
		{"PUBLIC_WEB_URL", "http://app.example.invalid"}, {"PUBLIC_WEB_URL", "https://app.example.invalid/path"},
		{"PUBLIC_WEB_URL", "https://user@app.example.invalid"}, {"NAVER_REDIRECT_URI", "https://attacker.invalid/callback"},
		{"AUTH_SESSION_IDLE_TTL", "0s"}, {"AUTH_SESSION_ABSOLUTE_TTL", "1m"}, {"AUTH_LOGIN_TTL", "1h"},
		{"AUTH_REAUTH_TTL", "24h"}, {"AUTH_HTTP_TIMEOUT", "1h"}, {"AUTH_ALLOWED_RETURN_PATHS", "//attacker.invalid"}, {"AUTH_DEV_LOGIN_ENABLED", "yes"},
	} {
		t.Run(tc.key+"_"+tc.value, func(t *testing.T) {
			v := configValues()
			v[tc.key] = tc.value
			if _, err := parseValues(v); err == nil {
				t.Fatal("unsafe configuration accepted")
			}
		})
	}
	c, err := parseValues(configValues())
	if err != nil {
		t.Fatal(err)
	}
	if !c.DevLogin {
		t.Fatal("explicit test dev login was not enabled")
	}
	for _, path := range []string{"https://attacker.invalid", "//attacker.invalid", "/auth/go-test?next=bad", "/auth/go-test#fragment", "/%2f%2fattacker", "/auth/../go-test", "/auth\\go-test", "/unlisted"} {
		if _, err := c.ReturnPath(path); err == nil {
			t.Fatalf("unsafe path accepted: %s", path)
		}
	}
	if path, err := c.ReturnPath(""); err != nil || path != TestPath {
		t.Fatal("default path rejected")
	}
}
func TestRandomTokensAndAmbiguousJSON(t *testing.T) {
	a, err := randomToken()
	if err != nil {
		t.Fatal(err)
	}
	b, err := randomToken()
	if err != nil {
		t.Fatal(err)
	}
	if a == b || !validToken(a) || len(hashToken(a)) != 64 || csrfToken(a) == a || !validToken(csrfToken(a)) {
		t.Fatal("invalid token construction")
	}
	for _, data := range []string{`{"iss":"one","iss":"two"}`, `{} {}`, `[]`, `null`} {
		if uniqueObject([]byte(data)) == nil {
			t.Fatal("ambiguous JSON accepted")
		}
	}
	if uniqueObject([]byte(`{"iss":"one","nested":{"name":"ok"}}`)) != nil {
		t.Fatal("valid JSON rejected")
	}
}

// Package auth owns the new, isolated Go web-login/session boundary.
package auth

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

const (
	Prefix   = "/api/v1/auth"
	TestPath = "/auth/go-test"
)

type ProviderConfig struct {
	Name         string
	ClientID     string
	ClientSecret string
	RedirectURI  string
	Enabled      bool
	Missing      []string
}

// Never serialize Config: it contains provider credentials.
type Config struct {
	PublicURL                                              string
	Providers                                              map[string]ProviderConfig
	AllowedPaths                                           map[string]bool
	IdleTTL, AbsoluteTTL, LoginTTL, ReauthTTL, HTTPTimeout time.Duration
	DevLogin                                               bool
	FixtureBase                                            string
	FixtureHTTP                                            bool
}

type ProviderStatus struct {
	Provider string   `json:"provider"`
	Enabled  bool     `json:"enabled"`
	Missing  []string `json:"missing"`
}

func LoadConfig(envFile string, db platform.Config) (Config, error) {
	values, err := platform.ReadEnvFile(envFile)
	if err != nil {
		return Config{}, err
	}
	return ParseConfig(func(k string) string {
		if v, ok := os.LookupEnv(k); ok {
			return v
		}
		return values[k]
	}, db)
}

func ParseConfig(get func(string) string, db platform.Config) (Config, error) {
	c := Config{PublicURL: get("PUBLIC_WEB_URL"), Providers: map[string]ProviderConfig{}, AllowedPaths: map[string]bool{TestPath: true},
		IdleTTL: 30 * time.Minute, AbsoluteTTL: 7 * 24 * time.Hour, LoginTTL: 10 * time.Minute, ReauthTTL: 5 * time.Minute, HTTPTimeout: 8 * time.Second}
	if err := configureFixture(&c, get, db); err != nil {
		return c, err
	}
	if raw := get("AUTH_DEV_LOGIN_ENABLED"); raw != "" {
		if raw != "true" && raw != "false" {
			return c, errors.New("AUTH_DEV_LOGIN_ENABLED must be true or false")
		}
		c.DevLogin = raw == "true"
		if c.DevLogin && db.Target != "fixture" && db.Target != "supabase-test" {
			return c, errors.New("AUTH_DEV_LOGIN_ENABLED is test-only")
		}
	}
	durations := []struct {
		key      string
		dst      *time.Duration
		min, max time.Duration
	}{
		{"AUTH_SESSION_IDLE_TTL", &c.IdleTTL, time.Minute, 24 * time.Hour},
		{"AUTH_SESSION_ABSOLUTE_TTL", &c.AbsoluteTTL, time.Minute, 30 * 24 * time.Hour},
		{"AUTH_LOGIN_TTL", &c.LoginTTL, time.Minute, 15 * time.Minute},
		{"AUTH_REAUTH_TTL", &c.ReauthTTL, time.Minute, 10 * time.Minute},
		{"AUTH_HTTP_TIMEOUT", &c.HTTPTimeout, time.Second, 10 * time.Second},
	}
	for _, d := range durations {
		if raw := get(d.key); raw != "" {
			v, err := time.ParseDuration(raw)
			if err != nil || v < d.min || v > d.max {
				return c, fmt.Errorf("invalid setting: %s", d.key)
			}
			*d.dst = v
		}
	}
	if c.IdleTTL > c.AbsoluteTTL {
		return c, errors.New("AUTH_SESSION_IDLE_TTL must not exceed AUTH_SESSION_ABSOLUTE_TTL")
	}
	if raw := get("AUTH_ALLOWED_RETURN_PATHS"); raw != "" {
		c.AllowedPaths = map[string]bool{}
		for _, p := range strings.Split(raw, ",") {
			p = strings.TrimSpace(p)
			if !safePath(p) {
				return c, errors.New("invalid setting: AUTH_ALLOWED_RETURN_PATHS")
			}
			c.AllowedPaths[p] = true
		}
		// The isolated result UI must remain a valid default, including on failures.
		if !c.AllowedPaths[TestPath] {
			return c, errors.New("AUTH_ALLOWED_RETURN_PATHS must include /auth/go-test")
		}
	}
	if c.PublicURL != "" && !validOrigin(c.PublicURL, c.FixtureHTTP) {
		return c, errors.New("invalid setting: PUBLIC_WEB_URL")
	}
	if c.DevLogin && c.PublicURL == "" {
		return c, errors.New("PUBLIC_WEB_URL is required when AUTH_DEV_LOGIN_ENABLED=true")
	}
	for _, name := range []string{"naver", "kakao"} {
		prefix := strings.ToUpper(name)
		p := ProviderConfig{Name: name, ClientID: get(prefix + "_CLIENT_ID"), ClientSecret: get(prefix + "_CLIENT_SECRET"), RedirectURI: get(prefix + "_REDIRECT_URI"), Missing: []string{}}
		for _, entry := range []struct{ key, value string }{{"PUBLIC_WEB_URL", c.PublicURL}, {prefix + "_CLIENT_ID", p.ClientID}, {prefix + "_CLIENT_SECRET", p.ClientSecret}, {prefix + "_REDIRECT_URI", p.RedirectURI}} {
			if entry.value == "" {
				p.Missing = append(p.Missing, entry.key)
			}
		}
		// A partial provider is disabled; its credential values never enter diagnostics.
		p.Enabled = len(p.Missing) == 0
		if p.RedirectURI != "" && (c.PublicURL == "" || p.RedirectURI != c.PublicURL+Prefix+"/"+name+"/callback") {
			if c.PublicURL != "" {
				return c, fmt.Errorf("invalid setting: %s_REDIRECT_URI", prefix)
			}
		}
		if strings.ContainsAny(p.ClientID+p.ClientSecret, "\r\n") || len(p.ClientID) > 512 || len(p.ClientSecret) > 1024 {
			return c, fmt.Errorf("invalid provider credential settings: %s", prefix)
		}
		c.Providers[name] = p
	}
	return c, nil
}

func (c Config) Statuses() []ProviderStatus {
	result := make([]ProviderStatus, 0, 2)
	for _, name := range []string{"naver", "kakao"} {
		p := c.Providers[name]
		result = append(result, ProviderStatus{name, p.Enabled, p.Missing})
	}
	return result
}
func (c Config) Enabled() bool { return c.Providers["naver"].Enabled || c.Providers["kakao"].Enabled }
func (c Config) SessionCookie() string {
	if c.FixtureHTTP {
		return "sg_session_fixture"
	}
	return "__Host-sg_session"
}
func (c Config) LoginCookie() string {
	if c.FixtureHTTP {
		return "sg_login_fixture"
	}
	return "__Host-sg_login"
}
func (c Config) ReturnPath(p string) (string, error) {
	if p == "" {
		p = TestPath
	}
	if !safePath(p) || !c.AllowedPaths[p] {
		return "", errReturnPath
	}
	return p, nil
}

var pathPattern = regexp.MustCompile(`^/[A-Za-z0-9/_-]*$`)

func safePath(p string) bool {
	return len(p) <= 256 && pathPattern.MatchString(p) && !strings.Contains(p, "//") && !strings.HasPrefix(p, Prefix)
}
func validOrigin(raw string, fixture bool) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" || u.RawPath != "" || strings.HasSuffix(raw, "/") {
		return false
	}
	if u.Scheme == "https" {
		return true
	}
	return fixture && u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1" || u.Hostname() == "web")
}

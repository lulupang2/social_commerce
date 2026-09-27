//go:build authfixture

package auth

import (
	"errors"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
	"net/url"
)

func configureFixture(c *Config, get func(string) string, db platform.Config) error {
	base, plain := get("AUTH_FIXTURE_OAUTH_BASE_URL"), get("AUTH_FIXTURE_HTTP")
	if base == "" && (plain == "" || plain == "false") {
		return nil
	}
	if get("APP_ENV") != "test" || db.Target != "fixture" || db.TargetID != platform.FixtureID {
		return errors.New("OAuth fixtures require the explicit disposable database target")
	}
	u, err := url.Parse(base)
	if err != nil || u.Scheme != "http" || u.User != nil || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost" && u.Hostname() != "::1" && u.Hostname() != "oauthfixture") {
		return errors.New("invalid setting: AUTH_FIXTURE_OAUTH_BASE_URL")
	}
	if plain != "true" && plain != "false" && plain != "" {
		return errors.New("invalid setting: AUTH_FIXTURE_HTTP")
	}
	c.FixtureBase, c.FixtureHTTP = base, plain == "true"
	return nil
}

//go:build !authfixture

package auth

import (
 "errors"
 "github.com/lulupang2/social_commerce/apps/api/internal/platform"
)
func configureFixture(_ *Config,get func(string) string,_ platform.Config) error {
 for _,k:=range []string{"AUTH_FIXTURE_OAUTH_BASE_URL","AUTH_FIXTURE_HTTP"} {
  if v:=get(k); v!="" && !(k=="AUTH_FIXTURE_HTTP" && v=="false") {return errors.New("OAuth fixture settings are unavailable in the normal API build")}
 }
 return nil
}

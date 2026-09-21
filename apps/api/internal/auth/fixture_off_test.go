//go:build !authfixture

package auth

import "testing"

func TestNormalBuildRejectsFixtureSettings(t *testing.T){
 for _,key:=range []string{"AUTH_FIXTURE_HTTP","AUTH_FIXTURE_OAUTH_BASE_URL"}{
  v:=configValues();v[key]="true"
  if _,err:=parseValues(v);err==nil{t.Fatal("normal API accepted fixture settings")}
 }
}

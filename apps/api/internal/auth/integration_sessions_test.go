//go:build integration && authfixture

package auth

import (
 "context"
 "errors"
 "strings"
 "testing"
)

func TestAuthSessionLifecycle(t *testing.T){
 pools:=readyAuthPools(t);ctx:=context.Background()
 t.Run("rotation_and_absolute_idle_bound",func(t *testing.T){
  h:=newHarness(t,pools);cookies:=map[string]string{};first:=h.login(t,"naver","session-rotation",cookies);old:=cookies[h.cfg.SessionCookie()]
  second:=h.login(t,"naver","session-rotation",cookies);current:=cookies[h.cfg.SessionCookie()]
  if old==current||first.Member.ID!=second.Member.ID||second.Session.ReauthenticatedAt!=nil{t.Fatal("login did not rotate session safely")}
  if _,err:=h.handler.Store.Session(ctx,old);!errors.Is(err,errUnauthorized){t.Fatal("rotated session still works")}
  _,err:=h.admin.Exec(ctx,`UPDATE summergear_app.auth_sessions SET idle_expires_at=clock_timestamp()+interval '1 minute',absolute_expires_at=clock_timestamp()+interval '2 minutes' WHERE token_hash=$1`,hashToken(current));require(t,err)
  view,err:=h.handler.Store.Session(ctx,current);require(t,err)
  if !view.Session.ExpiresAt.Equal(view.Session.AbsoluteExpiresAt){t.Fatal("idle refresh exceeded or failed to reach absolute cap")}
 })
 for _,kind:=range []string{"idle","absolute","suspended"}{t.Run(kind,func(t *testing.T){
  h:=newHarness(t,pools);cookies:=map[string]string{};view:=h.login(t,"kakao","session-expiry-"+kind,cookies);token:=cookies[h.cfg.SessionCookie()]
  var err error
  switch kind{
  case "idle":_,err=h.admin.Exec(ctx,`UPDATE summergear_app.auth_sessions SET idle_expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1`,hashToken(token))
  case "absolute":_,err=h.admin.Exec(ctx,`UPDATE summergear_app.auth_sessions SET created_at=clock_timestamp()-interval '2 hours',idle_expires_at=clock_timestamp()-interval '2 seconds',absolute_expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1`,hashToken(token))
  case "suspended":_,err=h.admin.Exec(ctx,`UPDATE summergear_app.members SET status='suspended' WHERE id=$1`,view.Member.ID)
  }
  require(t,err);resp,_:=h.request(t,"GET",Prefix+"/session",cookies,"",nil);if resp.StatusCode!=401{t.Fatalf("inactive session returned %d",resp.StatusCode)}
 })}
 t.Run("csrf_origin_and_current_device_logout",func(t *testing.T){
  h:=newHarness(t,pools);cookies:=map[string]string{};view:=h.login(t,"naver","session-logout",cookies);token:=cookies[h.cfg.SessionCookie()]
  wrong,_:=randomToken()
  for _,headers:=range []map[string]string{
   {},{"Origin":h.cfg.PublicURL},{"Origin":"https://other.invalid","X-CSRF-Token":view.CSRFToken},
   {"Origin":h.cfg.PublicURL,"X-CSRF-Token":wrong},{"Origin":h.cfg.PublicURL,"X-CSRF-Token":view.CSRFToken,"Sec-Fetch-Site":"cross-site"},
  }{resp,_:=h.request(t,"POST",Prefix+"/logout",cookies,"",headers);if resp.StatusCode!=403{t.Fatal("unsafe mutation accepted")}}
  resp,_:=h.request(t,"POST",Prefix+"/logout",cookies,"",h.mutationHeaders(view))
  if resp.StatusCode!=204||cookies[h.cfg.SessionCookie()]!=""{t.Fatal("logout did not clear cookie")}
  if _,err:=h.handler.Store.Session(ctx,token);!errors.Is(err,errUnauthorized){t.Fatal("logout did not revoke server session")}
 })
 t.Run("database_errors_are_503_not_anonymous_or_success",func(t *testing.T){
  h:=newHarness(t,pools);cookies:=map[string]string{};h.login(t,"kakao","session-db-failure",cookies)
  _,err:=h.admin.Exec(ctx,`REVOKE SELECT ON summergear_app.auth_sessions FROM summergear_api`);require(t,err)
  defer func(){_,err:=h.admin.Exec(ctx,`GRANT SELECT ON summergear_app.auth_sessions TO summergear_api`);require(t,err)}()
  resp,data:=h.request(t,"GET",Prefix+"/session",cookies,"",nil)
  if resp.StatusCode!=503||!strings.Contains(string(data),"AUTH_DATABASE_UNAVAILABLE"){t.Fatal("DB error converted to an unauthenticated success")}
  resp,_=h.request(t,"GET","/health/ready",nil,"",nil);if resp.StatusCode!=503{t.Fatal("auth readiness ignored missing permissions")}
 })
}

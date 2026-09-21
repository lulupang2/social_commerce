package auth

import (
 "context"
 "crypto/rsa"
 "crypto/tls"
 "net"
 "net/http"
 "net/url"
 "strings"
 "sync"
 "time"
 "unicode/utf8"
)

type Identity struct { Provider,Subject string; DisplayName,Email *string }
type endpoints struct { issuer,authorize,token,userinfo,jwks string }
type Provider struct {
 cfg ProviderConfig
 endpoints endpoints
 client *http.Client
 timeout time.Duration
 mu sync.Mutex
 keys map[string]*rsa.PublicKey
 fetched time.Time
}

func NewProvider(cfg ProviderConfig,c Config) *Provider {
 e:=endpoints{"https://nid.naver.com","https://nid.naver.com/oauth2/authorize","https://nid.naver.com/oauth2/token","https://openapi.naver.com/v1/nid/me","https://nid.naver.com/oauth2/jwks"}
 if cfg.Name=="kakao" {e=endpoints{"https://kauth.kakao.com","https://kauth.kakao.com/oauth/authorize","https://kauth.kakao.com/oauth/token","https://kapi.kakao.com/v1/oidc/userinfo","https://kauth.kakao.com/.well-known/jwks.json"}}
 if c.FixtureBase!="" {base:=c.FixtureBase+"/"+cfg.Name;e=endpoints{base,base+"/authorize",base+"/token",base+"/userinfo",base+"/jwks"}}
 transport:=&http.Transport{Proxy:nil,DialContext:(&net.Dialer{Timeout:3*time.Second,KeepAlive:30*time.Second}).DialContext,
  TLSClientConfig:&tls.Config{MinVersion:tls.VersionTLS12},TLSHandshakeTimeout:3*time.Second,ResponseHeaderTimeout:c.HTTPTimeout,
  MaxIdleConns:4,MaxIdleConnsPerHost:2,IdleConnTimeout:time.Minute,DisableCompression:true}
 return &Provider{cfg:cfg,endpoints:e,timeout:c.HTTPTimeout,keys:map[string]*rsa.PublicKey{},client:&http.Client{Transport:transport,Timeout:c.HTTPTimeout,CheckRedirect:func(*http.Request,[]*http.Request)error{return http.ErrUseLastResponse}}}
}

func (p *Provider) Authorize(state,verifier,nonce string,reauth bool) string {
 q:=url.Values{"response_type":{"code"},"client_id":{p.cfg.ClientID},"redirect_uri":{p.cfg.RedirectURI},"scope":{"openid"},"state":{state},"code_challenge":{pkceChallenge(verifier)},"code_challenge_method":{"S256"},"nonce":{nonce}}
 if reauth {if p.cfg.Name=="naver"{q.Set("auth_type","reauthenticate")}else{q.Set("prompt","login")}}
 return p.endpoints.authorize+"?"+q.Encode()
}

// One total deadline; never retry a potentially consumed authorization code.
func (p *Provider) Exchange(parent context.Context,code,state,verifier,nonce string,reauthAfter time.Time) (Identity,error) {
 ctx,cancel:=context.WithTimeout(parent,p.timeout);defer cancel()
 form:=url.Values{"grant_type":{"authorization_code"},"client_id":{p.cfg.ClientID},"client_secret":{p.cfg.ClientSecret},"redirect_uri":{p.cfg.RedirectURI},"code":{code},"state":{state},"code_verifier":{verifier}}
 var result struct {AccessToken string `json:"access_token"`;TokenType string `json:"token_type"`;IDToken string `json:"id_token"`}
 if err:=p.request(ctx,http.MethodPost,p.endpoints.token,form,"",&result);err!=nil{return Identity{},err}
 if result.AccessToken==""||len(result.AccessToken)>8192||strings.ContainsAny(result.AccessToken,"\r\n\x00")||!strings.EqualFold(result.TokenType,"bearer")||result.IDToken==""{return Identity{},errResponse}
 subject,err:=p.verifyID(ctx,result.IDToken,nonce,result.AccessToken,reauthAfter)
 if err!=nil{return Identity{},err}
 identity:=Identity{Provider:p.cfg.Name,Subject:subject}
 if p.cfg.Name=="naver" {
  var profile struct {Result string `json:"resultcode"`;Response struct {ID string `json:"id"`;Nickname *string `json:"nickname"`;Email *string `json:"email"`} `json:"response"`}
  if err=p.request(ctx,http.MethodGet,p.endpoints.userinfo,nil,result.AccessToken,&profile);err!=nil{return Identity{},err}
  if profile.Result!="00"||!equal(profile.Response.ID,subject){return Identity{},errResponse}
  identity.DisplayName,identity.Email=profile.Response.Nickname,profile.Response.Email
 } else {
  var profile struct {Subject string `json:"sub"`;Nickname *string `json:"nickname"`;Email *string `json:"email"`}
  if err=p.request(ctx,http.MethodGet,p.endpoints.userinfo,nil,result.AccessToken,&profile);err!=nil{return Identity{},err}
  if !equal(profile.Subject,subject){return Identity{},errResponse}
  identity.DisplayName,identity.Email=profile.Nickname,profile.Email
 }
 if !validOptional(identity.DisplayName,200)||!validOptional(identity.Email,320){return Identity{},errResponse}
 return identity,nil
}
func validOptional(p *string,max int)bool{return p==nil || (len(*p)<=max && utf8.ValidString(*p) && !strings.ContainsAny(*p,"\x00\r\n"))}

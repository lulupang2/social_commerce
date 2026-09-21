//go:build authfixture

package authfixture

import (
 "crypto"
 "crypto/rand"
 "crypto/rsa"
 "crypto/sha256"
 "encoding/base64"
 "encoding/json"
 "math/big"
 "net/http"
 "time"
)
func (s *Server) sign(rec record,access string)(string,error){
 s.mu.Lock();key,kid:=s.key,s.kid;s.mu.Unlock()
 now:=time.Now().Unix()
 claims:=map[string]any{"iss":s.BaseURL+"/"+rec.Provider,"sub":rec.Subject,"aud":"fixture-"+rec.Provider,"iat":now,"exp":now+300,"nonce":rec.Nonce,"auth_time":now}
 sum:=sha256.Sum256([]byte(access));claims["at_hash"]=base64.RawURLEncoding.EncodeToString(sum[:16])
 alg:="RS256"
 switch rec.Mode{
 case "bad-issuer":claims["iss"]="https://untrusted.invalid"
 case "bad-audience":claims["aud"]="another-client"
 case "expired":claims["iat"]=now-20;claims["exp"]=now-1
 case "future-issued":claims["iat"]=now+3600;claims["exp"]=now+7200
 case "bad-nonce":claims["nonce"]="untrusted-nonce"
 case "no-nonce":delete(claims,"nonce")
 case "no-subject":delete(claims,"sub")
 case "old-auth":claims["auth_time"]=now-3600
 case "bad-at-hash":claims["at_hash"]="wrong"
 case "bad-algorithm":alg="HS256"
 }
 header,_:=json.Marshal(map[string]any{"alg":alg,"kid":kid,"typ":"JWT"})
 payload,_:=json.Marshal(claims)
 input:=base64.RawURLEncoding.EncodeToString(header)+"."+base64.RawURLEncoding.EncodeToString(payload)
 digest:=sha256.Sum256([]byte(input))
 signature,err:=rsa.SignPKCS1v15(rand.Reader,key,crypto.SHA256,digest[:]);if err!=nil{return "",err}
 if rec.Mode=="bad-signature"{signature[0]^=1}
 return input+"."+base64.RawURLEncoding.EncodeToString(signature),nil
}
func (s *Server) jwks(w http.ResponseWriter,_ *http.Request){
 s.mu.Lock();key,kid:=s.key,s.kid;s.mu.Unlock()
 response(w,200,map[string]any{"keys":[]any{map[string]string{"kty":"RSA","use":"sig","alg":"RS256","kid":kid,
  "n":base64.RawURLEncoding.EncodeToString(key.N.Bytes()),"e":base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())}}})
}

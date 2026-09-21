package auth

import (
 "context"
 "crypto"
 "crypto/rsa"
 "crypto/sha256"
 "encoding/base64"
 "encoding/json"
 "strings"
 "time"
)

type idClaims struct {
 Issuer string `json:"iss"`
 Subject string `json:"sub"`
 Audience json.RawMessage `json:"aud"`
 AuthorizedParty string `json:"azp"`
 Expiry json.Number `json:"exp"`
 Issued json.Number `json:"iat"`
 NotBefore json.Number `json:"nbf"`
 AuthTime json.Number `json:"auth_time"`
 Nonce string `json:"nonce"`
 AccessHash string `json:"at_hash"`
}
func (p *Provider) verifyID(ctx context.Context,raw,nonce,access string,reauthAfter time.Time)(string,error){
 if len(raw)>32768{return "",errResponse}
 parts:=strings.Split(raw,".");if len(parts)!=3{return "",errResponse}
 header,err:=base64.RawURLEncoding.DecodeString(parts[0]);if err!=nil||uniqueObject(header)!=nil{return "",errResponse}
 var h struct{Alg,Kid string;Crit []string `json:"crit"`;JKU string `json:"jku"`;X5U string `json:"x5u"`}
 if json.Unmarshal(header,&h)!=nil||h.Alg!="RS256"||h.Kid==""||len(h.Kid)>200||len(h.Crit)>0||h.JKU!=""||h.X5U!=""{return "",errResponse}
 key,err:=p.signingKey(ctx,h.Kid);if err!=nil{return "",err}
 signature,err:=base64.RawURLEncoding.DecodeString(parts[2]);if err!=nil{return "",errResponse}
 digest:=sha256.Sum256([]byte(parts[0]+"."+parts[1]))
 if rsa.VerifyPKCS1v15(key,crypto.SHA256,digest[:],signature)!=nil{return "",errResponse}
 payload,err:=base64.RawURLEncoding.DecodeString(parts[1]);if err!=nil||uniqueObject(payload)!=nil{return "",errResponse}
 var c idClaims
 if json.Unmarshal(payload,&c)!=nil||c.Issuer!=p.endpoints.issuer||c.Subject==""||len(c.Subject)>255||strings.ContainsRune(c.Subject,'\x00'){return "",errResponse}
 var audience []string
 var single string
 if json.Unmarshal(c.Audience,&single)==nil{audience=[]string{single}}else if json.Unmarshal(c.Audience,&audience)!=nil{return "",errResponse}
 found:=false;for _,a:=range audience{if a==p.cfg.ClientID{found=true}}
 if !found||(len(audience)>1&&c.AuthorizedParty!=p.cfg.ClientID)||(c.AuthorizedParty!=""&&c.AuthorizedParty!=p.cfg.ClientID){return "",errResponse}
 now:=time.Now().Unix();exp,e1:=c.Expiry.Int64();issued,e2:=c.Issued.Int64()
 if e1!=nil||e2!=nil||issued<=0||exp<=now||issued>now+60||exp<=issued{return "",errResponse}
 if c.NotBefore!=""{nbf,err:=c.NotBefore.Int64();if err!=nil||nbf>now+60{return "",errResponse}}
 // Kakao documents nonce echo. Naver documents S256, not nonce echo: its
 // one-use state and mandatory S256 bind the code. Verify nonce when present.
 if (p.cfg.Name=="kakao"||c.Nonce!="")&&!equal(c.Nonce,nonce){return "",errResponse}
 if !reauthAfter.IsZero(){
  if c.AuthTime!=""{at,err:=c.AuthTime.Int64();if err!=nil||at<reauthAfter.Add(-time.Minute).Unix()||at>now+60{return "",errResponse}}else if p.cfg.Name=="kakao"{return "",errResponse}
 }
 if c.AccessHash!=""{sum:=sha256.Sum256([]byte(access));if !equal(c.AccessHash,base64.RawURLEncoding.EncodeToString(sum[:16])){return "",errResponse}}
 return c.Subject,nil
}

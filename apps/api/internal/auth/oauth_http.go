package auth

import (
 "bytes"
 "context"
 "encoding/json"
 "errors"
 "io"
 "net"
 "net/http"
 "net/url"
 "strings"
)

// No raw upstream response, URL error or credential leaves this adapter.
func (p *Provider) request(ctx context.Context,method,address string,form url.Values,access string,out any)error{
 var body io.Reader
 if form!=nil{body=strings.NewReader(form.Encode())}
 req,err:=http.NewRequestWithContext(ctx,method,address,body)
 if err!=nil{return errResponse}
 req.Header.Set("Accept","application/json")
 if form!=nil{req.Header.Set("Content-Type","application/x-www-form-urlencoded;charset=UTF-8")}
 if access!=""{req.Header.Set("Authorization","Bearer "+access)}
 resp,err:=p.client.Do(req)
 if err!=nil{
  var ne net.Error
  if errors.Is(ctx.Err(),context.DeadlineExceeded)||(errors.As(err,&ne)&&ne.Timeout()){return errTimeout}
  return errProvider
 }
 defer resp.Body.Close()
 if resp.StatusCode==429||resp.StatusCode>=500{return errProvider}
 if resp.StatusCode>=300&&resp.StatusCode<400{return errResponse}
 data,err:=io.ReadAll(io.LimitReader(resp.Body,128*1024+1))
 if err!=nil {if ctx.Err()!=nil{return errTimeout};return errProvider}
 if len(data)>128*1024||uniqueObject(data)!=nil{return errResponse}
 var failure struct {Error string `json:"error"`}
 if json.Unmarshal(data,&failure)!=nil{return errResponse}
 if failure.Error!="" {
  switch failure.Error {
  case "access_denied":return errDenied
  case "invalid_grant","invalid_code","invalid_request":return errCode
  case "temporarily_unavailable","server_error":return errProvider
  default:return errResponse
  }
 }
 if resp.StatusCode!=http.StatusOK || json.Unmarshal(data,out)!=nil{return errResponse}
 return nil
}

// Security claims must not use ambiguous last-key-wins JSON parsing.
func uniqueObject(data []byte)error{
 d:=json.NewDecoder(bytes.NewReader(data));tok,err:=d.Token()
 if err!=nil||tok!=json.Delim('{'){return errResponse}
 seen:=map[string]bool{}
 for d.More(){t,err:=d.Token();if err!=nil{return errResponse};k,ok:=t.(string);if !ok||seen[k]{return errResponse};seen[k]=true;var v json.RawMessage;if d.Decode(&v)!=nil{return errResponse}}
 if _,err=d.Token();err!=nil{return errResponse}
 if _,err=d.Token();!errors.Is(err,io.EOF){return errResponse}
 return nil
}

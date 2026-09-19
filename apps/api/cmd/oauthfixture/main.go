//go:build authfixture

// This executable does not exist in a normal build. Never use it with Supabase.
package main

import (
 "context"
 "io"
 "log"
 "net/http"
 "os"
 "os/signal"
 "syscall"
 "time"

 "github.com/lulupang2/social_commerce/apps/api/internal/authfixture"
 "github.com/lulupang2/social_commerce/apps/api/internal/platform"
)
func main(){
 if os.Getenv("APP_ENV")!="test"||os.Getenv("DB_TARGET")!="fixture"||os.Getenv("DB_TARGET_ID")!=platform.FixtureID||os.Getenv("AUTH_FIXTURE_OAUTH_BASE_URL")!="http://oauthfixture:18090"||os.Getenv("PUBLIC_WEB_URL")!="http://web:3000"{
  log.Print("OAuth fixture startup refused: disposable fixture settings required");os.Exit(1)
 }
 handler,err:=authfixture.New("http://oauthfixture:18090","http://web:3000")
 if err!=nil{log.Print("OAuth fixture initialization failed");os.Exit(1)}
 server:=&http.Server{Addr:":18090",Handler:handler,ReadHeaderTimeout:3*time.Second,ReadTimeout:5*time.Second,WriteTimeout:10*time.Second,IdleTimeout:30*time.Second,ErrorLog:log.New(io.Discard,"",0)}
 ctx,stop:=signal.NotifyContext(context.Background(),syscall.SIGINT,syscall.SIGTERM);defer stop()
 done:=make(chan error,1);go func(){done<-server.ListenAndServe()}()
 select{case <-ctx.Done():shutdown,cancel:=context.WithTimeout(context.Background(),5*time.Second);defer cancel();_ = server.Shutdown(shutdown)
 case err:=<-done:if err!=nil&&err!=http.ErrServerClosed{log.Print("OAuth fixture listener failed");os.Exit(1)}}
}

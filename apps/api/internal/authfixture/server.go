//go:build authfixture

// Package authfixture is absent from normal builds. It simulates the provider
// protocol, not the application's authentication or session issuance.
package authfixture

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

type record struct {
	Provider, Redirect, State, Challenge, Nonce, Subject, Mode string
	Created                                                    time.Time
}
type Server struct {
	BaseURL, CallbackOrigin string // set once, before serving
	mu                      sync.Mutex
	key                     *rsa.PrivateKey
	kid                     string
	mode                    string
	subjects                map[string]string
	codes, access           map[string]record
}

func New(base, origin string) (*Server, error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, err
	}
	return &Server{BaseURL: base, CallbackOrigin: origin, key: key, kid: "fixture-key-1", subjects: map[string]string{"naver": "fixture-naver-member", "kakao": "fixture-kakao-member"}, codes: map[string]record{}, access: map[string]record{}}, nil
}
func (s *Server) SetMode(mode string) { s.mu.Lock(); defer s.mu.Unlock(); s.mode = mode }
func (s *Server) SetSubject(provider, subject string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.subjects[provider] = subject
}
func (s *Server) Rotate() error {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return err
	}
	kid, err := random()
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.key, s.kid = key, kid
	return nil
}
func random() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}
func response(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func failure(w http.ResponseWriter, code string) { response(w, 400, map[string]string{"error": code}) }
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/health/live" {
		response(w, 200, map[string]string{"status": "ok"})
		return
	}
	for _, provider := range []string{"naver", "kakao"} {
		switch r.URL.Path {
		case "/" + provider + "/authorize":
			s.authorize(w, r, provider)
			return
		case "/" + provider + "/token":
			s.token(w, r, provider)
			return
		case "/" + provider + "/userinfo":
			s.userinfo(w, r, provider)
			return
		case "/" + provider + "/jwks":
			s.jwks(w, r)
			return
		}
	}
	http.NotFound(w, r)
}

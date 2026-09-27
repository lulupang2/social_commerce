//go:build authfixture

package authfixture

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (s *Server) authorize(w http.ResponseWriter, r *http.Request, provider string) {
	q := r.URL.Query()
	if r.Method != "GET" || q.Get("client_id") != "fixture-"+provider || q.Get("response_type") != "code" || q.Get("scope") != "openid" || q.Get("code_challenge_method") != "S256" || len(q.Get("code_challenge")) != 43 || len(q.Get("state")) != 43 || len(q.Get("nonce")) != 43 || q.Get("redirect_uri") != s.CallbackOrigin+"/api/v1/auth/"+provider+"/callback" {
		failure(w, "invalid_request")
		return
	}
	s.mu.Lock()
	mode, subject := s.mode, s.subjects[provider]
	now := time.Now()
	for k, v := range s.codes {
		if now.Sub(v.Created) > time.Minute {
			delete(s.codes, k)
		}
	}
	for k, v := range s.access {
		if now.Sub(v.Created) > time.Minute {
			delete(s.access, k)
		}
	}
	if len(s.codes) > 2048 || len(s.access) > 2048 {
		s.mu.Unlock()
		failure(w, "temporarily_unavailable")
		return
	}
	s.mu.Unlock()
	values := url.Values{"state": {q.Get("state")}}
	if mode == "denied" {
		values.Set("error", "access_denied")
	} else {
		code, err := random()
		if err != nil {
			failure(w, "server_error")
			return
		}
		rec := record{provider, q.Get("redirect_uri"), q.Get("state"), q.Get("code_challenge"), q.Get("nonce"), subject, mode, now}
		s.mu.Lock()
		s.codes[code] = rec
		s.mu.Unlock()
		values.Set("code", code)
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(w, r, q.Get("redirect_uri")+"?"+values.Encode(), http.StatusSeeOther)
}
func (s *Server) token(w http.ResponseWriter, r *http.Request, provider string) {
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if r.Method != "POST" || r.ParseForm() != nil {
		failure(w, "invalid_request")
		return
	}
	q := r.PostForm
	if q.Get("client_id") != "fixture-"+provider || q.Get("client_secret") != "fixture-secret-"+provider || q.Get("grant_type") != "authorization_code" {
		failure(w, "invalid_client")
		return
	}
	s.mu.Lock()
	rec, ok := s.codes[q.Get("code")]
	if ok {
		delete(s.codes, q.Get("code"))
	}
	s.mu.Unlock()
	hash := sha256.Sum256([]byte(q.Get("code_verifier")))
	if !ok || rec.Provider != provider || time.Since(rec.Created) > time.Minute || rec.Redirect != q.Get("redirect_uri") || rec.State != q.Get("state") || rec.Challenge != base64.RawURLEncoding.EncodeToString(hash[:]) {
		failure(w, "invalid_grant")
		return
	}
	switch rec.Mode {
	case "outage":
		response(w, 503, map[string]string{"error": "server_error"})
		return
	case "invalid-code":
		failure(w, "invalid_grant")
		return
	case "timeout":
		select {
		case <-r.Context().Done():
			return
		case <-time.After(3 * time.Second):
		}
		return
	case "bad-json":
		w.WriteHeader(200)
		_, _ = w.Write([]byte("not json"))
		return
	case "oversized":
		w.WriteHeader(200)
		_, _ = w.Write([]byte(strings.Repeat("x", 128*1024+1)))
		return
	case "redirect":
		http.Redirect(w, r, s.BaseURL+"/should-not-follow", 302)
		return
	}
	access, err := random()
	if err != nil {
		failure(w, "server_error")
		return
	}
	signed, err := s.sign(rec, access)
	if err != nil {
		failure(w, "server_error")
		return
	}
	s.mu.Lock()
	s.access[access] = rec
	s.mu.Unlock()
	response(w, 200, map[string]any{"access_token": access, "token_type": "Bearer", "id_token": signed, "expires_in": 300})
}
func (s *Server) userinfo(w http.ResponseWriter, r *http.Request, provider string) {
	access := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	s.mu.Lock()
	rec, ok := s.access[access]
	s.mu.Unlock()
	if !ok || rec.Provider != provider || time.Since(rec.Created) > time.Minute {
		failure(w, "invalid_token")
		return
	}
	if rec.Mode == "userinfo-outage" {
		response(w, 503, map[string]string{"error": "server_error"})
		return
	}
	subject := rec.Subject
	if rec.Mode == "userinfo-mismatch" {
		subject = "different-subject"
	}
	profile := map[string]any{"nickname": "Fixture Member"}
	if rec.Mode != "no-email" {
		profile["email"] = "fixture@example.invalid"
	}
	if provider == "naver" {
		profile["id"] = subject
		response(w, 200, map[string]any{"resultcode": "00", "response": profile})
	} else {
		profile["sub"] = subject
		response(w, 200, profile)
	}
}

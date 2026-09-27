//go:build integration && authfixture

package auth

import (
	"context"
	"net/url"
	"strings"
	"testing"
)

func changeQuery(path, key, value string) string {
	u, _ := url.Parse(path)
	q := u.Query()
	q.Set(key, value)
	u.RawQuery = q.Encode()
	return u.RequestURI()
}
func stateOf(path string) string { u, _ := url.Parse(path); return u.Query().Get("state") }
func TestAuthStateAndFailures(t *testing.T) {
	pools := readyAuthPools(t)
	for _, name := range []string{"forged", "expired", "reused", "browser", "provider", "duplicate", "missing-browser"} {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t, pools)
			cookies := map[string]string{}
			path := h.start(t, "naver", cookies)
			original := duplicateCookies(cookies)
			requestPath := path
			want := 400
			expected := ""
			switch name {
			case "forged":
				token, _ := randomToken()
				requestPath = changeQuery(path, "state", token)
				expected = "STATE_INVALID"
			case "expired":
				_, err := h.admin.Exec(context.Background(), `UPDATE summergear_app.auth_login_transactions SET expires_at=clock_timestamp()-interval '1 second' WHERE state_hash=$1`, hashToken(stateOf(path)))
				require(t, err)
				want = 410
				expected = "STATE_EXPIRED"
			case "reused":
				h.finish(t, path, cookies)
				cookies = original
				want = 409
				expected = "STATE_REUSED"
			case "browser":
				cookies[h.cfg.LoginCookie()], _ = randomToken()
				expected = "BROWSER_MISMATCH"
			case "provider":
				requestPath = strings.Replace(path, "/naver/", "/kakao/", 1)
				expected = "PROVIDER_MISMATCH"
			case "duplicate":
				requestPath = path + "&state=" + stateOf(path)
				expected = "AUTH_REQUEST_INVALID"
			case "missing-browser":
				cookies = map[string]string{}
				expected = "BROWSER_MISMATCH"
			}
			resp, data := h.request(t, "GET", requestPath, cookies, "", nil)
			if resp.StatusCode != want || !strings.Contains(string(data), expected) || resp.Header.Get("Location") != "" {
				t.Fatalf("unsafe state response: %d %s", resp.StatusCode, data)
			}
			if name == "forged" || name == "browser" || name == "provider" || name == "duplicate" {
				h.finish(t, path, original)
			}
		})
	}
	t.Run("unsafe_return_paths_and_cross_site_start", func(t *testing.T) {
		h := newHarness(t, pools)
		for _, path := range []string{"//attacker.invalid", "https://attacker.invalid", "/%2f%2fattacker", "/auth/go-test?next=bad", "/unknown"} {
			resp, _ := h.request(t, "GET", Prefix+"/naver/start?returnTo="+url.QueryEscape(path), map[string]string{}, "", nil)
			if resp.StatusCode != 400 || resp.Header.Get("Location") != "" {
				t.Fatal("unsafe return URL accepted")
			}
		}
		resp, _ := h.request(t, "GET", Prefix+"/naver/start", map[string]string{}, "", map[string]string{"Sec-Fetch-Site": "cross-site"})
		if resp.StatusCode != 403 {
			t.Fatal("cross-site login start accepted")
		}
	})
	for _, tc := range []struct{ mode, code string }{{"denied", "OAUTH_DENIED"}, {"outage", "OAUTH_UNAVAILABLE"}, {"timeout", "OAUTH_TIMEOUT"}, {"bad-json", "OAUTH_RESPONSE_INVALID"}} {
		t.Run(tc.mode, func(t *testing.T) {
			h := newHarness(t, pools)
			h.fixture.SetMode(tc.mode)
			cookies := map[string]string{}
			path := h.start(t, "kakao", cookies)
			original := duplicateCookies(cookies)
			resp, _ := h.request(t, "GET", path, cookies, "", nil)
			if resp.StatusCode != 303 || !strings.Contains(resp.Header.Get("Location"), "code="+tc.code) || cookies[h.cfg.SessionCookie()] != "" {
				t.Fatal("provider failure became login success")
			}
			resp, _ = h.request(t, "GET", path, original, "", nil)
			if resp.StatusCode != 409 {
				t.Fatal("failed provider request did not consume state")
			}
			if strings.Contains(h.logs.String(), stateOf(path)) {
				t.Fatal("callback state leaked into logs")
			}
		})
	}
	t.Run("code_reuse_in_a_new_transaction", func(t *testing.T) {
		h := newHarness(t, pools)
		first := map[string]string{}
		path := h.start(t, "naver", first)
		h.finish(t, path, first)
		used, _ := url.Parse(path)
		second := map[string]string{}
		next := h.start(t, "naver", second)
		resp, _ := h.request(t, "GET", changeQuery(next, "code", used.Query().Get("code")), second, "", nil)
		if resp.StatusCode != 303 || !strings.Contains(resp.Header.Get("Location"), "OAUTH_CODE_INVALID") || second[h.cfg.SessionCookie()] != "" {
			t.Fatal("reused provider code issued a session")
		}
	})
	t.Run("session_insert_failure_rolls_back_new_member", func(t *testing.T) {
		h := newHarness(t, pools)
		h.fixture.SetSubject("naver", "must-rollback-member")
		cookies := map[string]string{}
		path := h.start(t, "naver", cookies)
		var before int
		require(t, h.admin.QueryRow(context.Background(), `SELECT count(*) FROM summergear_app.members`).Scan(&before))
		_, err := h.admin.Exec(context.Background(), `REVOKE INSERT ON summergear_app.auth_sessions FROM summergear_api`)
		require(t, err)
		defer func() {
			_, err := h.admin.Exec(context.Background(), `GRANT INSERT ON summergear_app.auth_sessions TO summergear_api`)
			require(t, err)
		}()
		resp, _ := h.request(t, "GET", path, cookies, "", nil)
		if resp.StatusCode != 303 || !strings.Contains(resp.Header.Get("Location"), "AUTH_DATABASE_UNAVAILABLE") || cookies[h.cfg.SessionCookie()] != "" {
			t.Fatal("DB failure became login success")
		}
		var after int
		require(t, h.admin.QueryRow(context.Background(), `SELECT count(*) FROM summergear_app.members`).Scan(&after))
		if after != before {
			t.Fatal("failed session insert left an orphan member")
		}
	})
}

//go:build integration && authfixture

package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strings"
	"testing"
)

func (h *harness) reauthStart(t *testing.T, name string, cookies map[string]string, view SessionView) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"provider": name, "returnTo": TestPath})
	resp, data := h.request(t, "POST", Prefix+"/reauthenticate", cookies, string(body), h.mutationHeaders(view))
	if resp.StatusCode != 200 {
		t.Fatalf("reauthentication start failed: %d %s", resp.StatusCode, data)
	}
	var result struct {
		AuthorizationURL string `json:"authorizationUrl"`
	}
	require(t, json.Unmarshal(data, &result))
	return h.authorize(t, result.AuthorizationURL)
}
func TestAuthExplicitReauthentication(t *testing.T) {
	pools := readyAuthPools(t)
	ctx := context.Background()
	t.Run("fresh_explicit_reauth_required_and_revokes_every_device", func(t *testing.T) {
		h := newHarness(t, pools)
		first, second := map[string]string{}, map[string]string{}
		view := h.login(t, "kakao", "global-logout", first)
		other := h.login(t, "kakao", "global-logout", second)
		resp, data := h.request(t, "POST", Prefix+"/logout-all", first, "", h.mutationHeaders(view))
		if resp.StatusCode != 403 || !strings.Contains(string(data), "REAUTH_REQUIRED") {
			t.Fatal("ordinary login incorrectly counted as explicit reauthentication")
		}
		view = h.finish(t, h.reauthStart(t, "kakao", first, view), first)
		if view.Session.ReauthenticatedAt == nil {
			t.Fatal("explicit reauthentication not recorded")
		}
		pending := h.reauthStart(t, "kakao", second, other)
		firstToken, secondToken := first[h.cfg.SessionCookie()], second[h.cfg.SessionCookie()]
		resp, _ = h.request(t, "POST", Prefix+"/logout-all", first, "", h.mutationHeaders(view))
		if resp.StatusCode != 204 {
			t.Fatal("full revocation failed")
		}
		for _, token := range []string{firstToken, secondToken} {
			if _, err := h.handler.Store.Session(ctx, token); !errors.Is(err, errUnauthorized) {
				t.Fatal("a device survived global revocation")
			}
		}
		resp, _ = h.request(t, "GET", pending, second, "", nil)
		if resp.StatusCode != 409 {
			t.Fatal("pending reauth survived global revocation")
		}
	})
	t.Run("wrong_identity_does_not_link_or_switch_account", func(t *testing.T) {
		h := newHarness(t, pools)
		cookies := map[string]string{}
		view := h.login(t, "naver", "reauth-original", cookies)
		h.fixture.SetSubject("naver", "reauth-unrelated")
		var before int
		require(t, h.admin.QueryRow(ctx, `SELECT count(*) FROM summergear_app.members`).Scan(&before))
		path := h.reauthStart(t, "naver", cookies, view)
		resp, _ := h.request(t, "GET", path, cookies, "", nil)
		if resp.StatusCode != 303 || !strings.Contains(resp.Header.Get("Location"), "REAUTH_IDENTITY_MISMATCH") {
			t.Fatal("reauthentication switched member")
		}
		actual, err := h.handler.Store.Session(ctx, cookies[h.cfg.SessionCookie()])
		require(t, err)
		if actual.Member.ID != view.Member.ID || actual.Session.ReauthenticatedAt != nil {
			t.Fatal("failed reauth changed session")
		}
		var after int
		require(t, h.admin.QueryRow(ctx, `SELECT count(*) FROM summergear_app.members`).Scan(&after))
		if after != before {
			t.Fatal("reauth created or linked an unrelated member")
		}
	})
	t.Run("stale_reauthentication_is_rejected", func(t *testing.T) {
		h := newHarness(t, pools)
		cookies := map[string]string{}
		view := h.login(t, "kakao", "stale-reauth", cookies)
		view = h.finish(t, h.reauthStart(t, "kakao", cookies, view), cookies)
		_, err := h.admin.Exec(ctx, `UPDATE summergear_app.auth_sessions SET reauthenticated_at=clock_timestamp()-interval '6 minutes' WHERE token_hash=$1`, hashToken(cookies[h.cfg.SessionCookie()]))
		require(t, err)
		resp, _ := h.request(t, "POST", Prefix+"/logout-all", cookies, "", h.mutationHeaders(view))
		if resp.StatusCode != 403 {
			t.Fatal("stale reauthentication accepted")
		}
	})
	t.Run("inflight_consumed_reauth_cannot_resurrect_revoked_anchor", func(t *testing.T) {
		h := newHarness(t, pools)
		first, second := map[string]string{}, map[string]string{}
		view := h.login(t, "kakao", "inflight-reauth", first)
		other := h.login(t, "kakao", "inflight-reauth", second)
		view = h.finish(t, h.reauthStart(t, "kakao", first, view), first)
		path := h.reauthStart(t, "kakao", second, other)
		u, _ := url.Parse(path)
		q := u.Query()
		l, err := h.handler.Store.ConsumeLogin(ctx, q.Get("state"), second[h.cfg.LoginCookie()], "kakao")
		require(t, err)
		identity, err := h.handler.Providers["kakao"].Exchange(ctx, q.Get("code"), q.Get("state"), l.Verifier, l.Nonce, l.CreatedAt)
		require(t, err)
		resp, _ := h.request(t, "POST", Prefix+"/logout-all", first, "", h.mutationHeaders(view))
		if resp.StatusCode != 204 {
			t.Fatal("full revocation failed")
		}
		_, _, err = h.handler.Store.CompleteLogin(ctx, l, identity, second[h.cfg.SessionCookie()])
		if !errors.Is(err, errUnauthorized) {
			t.Fatal("inflight callback resurrected a revoked session")
		}
	})
}

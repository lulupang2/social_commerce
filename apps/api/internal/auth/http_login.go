package auth

import (
	"context"
	"net/url"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
)

func (h *Handler) begin(c fiber.Ctx, ctx context.Context, provider, returnTo, token string, member *string) (string, error) {
	if provider != "naver" && provider != "kakao" {
		return "", errRequest
	}
	p := h.Providers[provider]
	if p == nil {
		return "", errDisabled
	}
	path, err := h.Config.ReturnPath(returnTo)
	if err != nil {
		return "", err
	}
	state, err := randomToken()
	if err != nil {
		return "", err
	}
	browser, err := randomToken()
	if err != nil {
		return "", err
	}
	verifier, err := randomToken()
	if err != nil {
		return "", err
	}
	nonce, err := randomToken()
	if err != nil {
		return "", err
	}
	l := Login{StateHash: hashToken(state), BrowserHash: hashToken(browser), Provider: provider, ReturnPath: path, Verifier: verifier, Nonce: nonce, Purpose: "login"}
	if member != nil {
		hash := hashToken(token)
		l.Purpose = "reauth"
		l.AnchorSessionHash = &hash
		l.MemberID = member
	}
	if err = h.Store.CreateLogin(ctx, &l); err != nil {
		return "", err
	}
	// One active browser flow is deliberate: starting another replaces binding.
	h.cookie(c, h.Config.LoginCookie(), browser, l.ExpiresAt)
	return p.Authorize(state, verifier, nonce, member != nil), nil
}
func (h *Handler) start(c fiber.Ctx, ctx context.Context) error {
	if !h.allow(c) {
		return errRate
	}
	if h.Config.PublicURL != "" {
		if err := h.origin(c, false); err != nil {
			return err
		}
	}
	q, err := query(c)
	if err != nil {
		return err
	}
	for key := range q {
		if key != "returnTo" {
			return errRequest
		}
	}
	location, err := h.begin(c, ctx, c.Params("provider"), q.Get("returnTo"), "", nil)
	if err != nil {
		return err
	}
	return redirect(c, location)
}
func (h *Handler) callback(c fiber.Ctx, ctx context.Context) error {
	if !h.allow(c) {
		return errRate
	}
	name := c.Params("provider")
	p := h.Providers[name]
	if p == nil {
		if name != "naver" && name != "kakao" {
			return errRequest
		}
		return errDisabled
	}
	q, err := query(c)
	if err != nil {
		return err
	}
	state := q.Get("state")
	if !validToken(state) {
		return errState
	}
	browser, err := cookieValue(c, h.Config.LoginCookie())
	if err != nil {
		return err
	}
	if !validToken(browser) {
		return errBrowser
	}
	l, err := h.Store.ConsumeLogin(ctx, state, browser, name)
	if err != nil {
		return err
	}
	h.cookie(c, h.Config.LoginCookie(), "", time.Time{})
	path, err := h.Config.ReturnPath(l.ReturnPath)
	if err != nil {
		return err
	}
	fail := func(cause error) error {
		f := publicFailure(cause)
		h.logger.Warn("oauth_callback_rejected", "provider", name, "error_code", f.Code, "request_id", c.GetRespHeader("X-Request-ID"))
		return redirect(c, path+"?"+url.Values{"auth": {"error"}, "code": {f.Code}}.Encode())
	}
	if q.Get("iss") != "" && q.Get("iss") != p.endpoints.issuer {
		return fail(errProviderMismatch)
	}
	if e := q.Get("error"); e != "" {
		if q.Get("code") != "" {
			return fail(errRequest)
		}
		if e == "access_denied" {
			return fail(errDenied)
		}
		if e == "temporarily_unavailable" || e == "server_error" {
			return fail(errProvider)
		}
		return fail(errResponse)
	}
	code := q.Get("code")
	if code == "" || len(code) > 4096 || strings.ContainsAny(code, "\r\n\x00") {
		return fail(errCode)
	}
	var reauthAfter time.Time
	if l.Purpose == "reauth" {
		reauthAfter = l.CreatedAt
	}
	identity, err := p.Exchange(ctx, code, state, l.Verifier, l.Nonce, reauthAfter)
	if err != nil {
		return fail(err)
	}
	oldToken, err := cookieValue(c, h.Config.SessionCookie())
	if err != nil {
		return fail(err)
	}
	token, view, err := h.Store.CompleteLogin(ctx, l, identity, oldToken)
	if err != nil {
		return fail(err)
	}
	h.cookie(c, h.Config.SessionCookie(), token, view.Session.AbsoluteExpiresAt)
	h.logger.Info("oauth_login_completed", "provider", name, "purpose", l.Purpose, "request_id", c.GetRespHeader("X-Request-ID"))
	return redirect(c, path+"?auth=success")
}

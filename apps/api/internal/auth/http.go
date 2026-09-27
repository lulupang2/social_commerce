package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	Config    Config
	Store     *Store
	Providers map[string]*Provider
	logger    *slog.Logger
	mu        sync.Mutex
	windows   map[string]rateWindow
}
type rateWindow struct {
	start time.Time
	count int
}

func Register(app *fiber.App, cfg Config, pool *pgxpool.Pool, logger *slog.Logger) *Handler {
	h := &Handler{Config: cfg, Store: &Store{pool, cfg}, Providers: map[string]*Provider{}, logger: logger, windows: map[string]rateWindow{}}
	for name, p := range cfg.Providers {
		if p.Enabled {
			h.Providers[name] = NewProvider(p, cfg)
		}
	}
	app.Use(Prefix, func(c fiber.Ctx) error {
		c.Set("Cache-Control", "no-store")
		c.Set("Referrer-Policy", "no-referrer")
		return c.Next()
	})
	app.Get(Prefix+"/providers", func(c fiber.Ctx) error { return c.JSON(fiber.Map{"providers": cfg.Statuses()}) })
	if cfg.DevLogin {
		app.Post(Prefix+"/dev-login", h.wrap(h.devLogin))
		if cfg.FixtureRoles {
			app.Get(Prefix+"/fixture-roles", func(c fiber.Ctx) error {
				return c.JSON(fiber.Map{"roles": []string{"buyer_a", "buyer_b", "seller_a", "seller_b", "reviewer"}})
			})
		}
	}
	app.Get(Prefix+"/session", h.wrap(h.session))
	app.Post(Prefix+"/logout", h.wrap(func(c fiber.Ctx, ctx context.Context) error { return h.logout(c, ctx, false) }))
	app.Post(Prefix+"/logout-all", h.wrap(func(c fiber.Ctx, ctx context.Context) error { return h.logout(c, ctx, true) }))
	app.Post(Prefix+"/reauthenticate", h.wrap(h.reauthenticate))
	app.Get(Prefix+"/:provider/start", h.wrap(h.start))
	app.Get(Prefix+"/:provider/callback", h.wrap(h.callback))
	return h
}
func (h *Handler) wrap(fn func(fiber.Ctx, context.Context) error) fiber.Handler {
	return func(c fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := fn(c, ctx); err != nil {
			f := publicFailure(err)
			h.logger.Warn("auth_request_rejected", "error_code", f.Code, "request_id", c.GetRespHeader("X-Request-ID"))
			return c.Status(f.Status).JSON(fiber.Map{"code": f.Code, "message": f.Message, "requestId": c.GetRespHeader("X-Request-ID")})
		}
		return nil
	}
}
func query(c fiber.Ctx) (url.Values, error) {
	raw := string(c.Request().URI().QueryString())
	if len(raw) > 8192 {
		return nil, errRequest
	}
	q, err := url.ParseQuery(raw)
	if err != nil {
		return nil, errRequest
	}
	for _, values := range q {
		if len(values) != 1 {
			return nil, errRequest
		}
	}
	return q, nil
}
func cookieValue(c fiber.Ctx, name string) (string, error) {
	result := ""
	count := 0
	for _, part := range strings.Split(c.Get("Cookie"), ";") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if ok && key == name {
			count++
			result = value
		}
	}
	if count > 1 {
		return "", errRequest
	}
	return result, nil
}

// SessionTokenHash is for server-side binding to the already authenticated
// Go session; callers must invoke RequireMutationSession first.
func (h *Handler) SessionTokenHash(c fiber.Ctx) (string, error) {
	token, err := cookieValue(c, h.Config.SessionCookie())
	if err != nil {
		return "", err
	}
	if !validToken(token) {
		return "", errUnauthorized
	}
	return hashToken(token), nil
}
func (h *Handler) cookie(c fiber.Ctx, name, value string, expires time.Time) {
	maxAge := int(time.Until(expires).Seconds())
	if value == "" {
		maxAge = -1
		expires = time.Unix(1, 0)
	}
	c.Cookie(&fiber.Cookie{Name: name, Value: value, Path: "/", HTTPOnly: true, Secure: !h.Config.FixtureHTTP, SameSite: "Lax", Expires: expires, MaxAge: maxAge})
}
func redirect(c fiber.Ctx, target string) error {
	c.Set("Location", target)
	return c.Status(303).Send(nil)
}
func (h *Handler) origin(c fiber.Ctx, required bool) error {
	origin := c.Get("Origin")
	if (required && origin == "") || (origin != "" && origin != h.Config.PublicURL) || h.Config.PublicURL == "" {
		return errOrigin
	}
	if c.Get("Sec-Fetch-Site") == "cross-site" {
		return errOrigin
	}
	return nil
}
func (h *Handler) mutation(c fiber.Ctx) (string, error) {
	if err := h.origin(c, true); err != nil {
		return "", err
	}
	token, err := cookieValue(c, h.Config.SessionCookie())
	if err != nil {
		return "", err
	}
	if !validToken(token) {
		return "", errUnauthorized
	}
	supplied := c.Get("X-CSRF-Token")
	if !validToken(supplied) || !equal(supplied, csrfToken(token)) {
		return "", errCSRF
	}
	return token, nil
}
func (h *Handler) allow(c fiber.Ctx) bool {
	// Deliberately do not trust arbitrary X-Forwarded-For. A shared proxy IP gets
	// a conservative common budget until a trusted gateway policy is configured.
	h.mu.Lock()
	defer h.mu.Unlock()
	now := time.Now()
	for key, window := range h.windows {
		if now.Sub(window.start) >= time.Minute {
			delete(h.windows, key)
		}
	}
	key := strings.Clone(c.IP())
	window, ok := h.windows[key]
	if !ok {
		if len(h.windows) >= 1024 {
			return false
		}
		window = rateWindow{start: now}
	}
	window.count++
	h.windows[key] = window
	if window.count > 60 {
		c.Set("Retry-After", "60")
		return false
	}
	return true
}
func (h *Handler) devLogin(c fiber.Ctx, ctx context.Context) error {
	if !h.Config.DevLogin {
		return errDisabled
	}
	if !h.allow(c) {
		return errRate
	}
	if err := h.origin(c, true); err != nil {
		return err
	}
	role := ""
	if len(c.Body()) != 0 {
		if !h.Config.FixtureRoles || !strings.HasPrefix(strings.ToLower(c.Get("Content-Type")), "application/json") || len(c.Body()) > 128 || uniqueObject(c.Body()) != nil {
			return errRequest
		}
		var body struct {
			Role string `json:"role"`
		}
		decoder := json.NewDecoder(bytes.NewReader(c.Body()))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&body) != nil {
			return errRequest
		}
		var extra any
		if decoder.Decode(&extra) != io.EOF {
			return errRequest
		}
		role = body.Role
		if _, ok := fixtureMembers[role]; !ok {
			return errRequest
		}
	}
	oldToken, err := cookieValue(c, h.Config.SessionCookie())
	if err != nil {
		return err
	}
	token, view, err := h.Store.DevLogin(ctx, oldToken, role)
	if err != nil {
		return err
	}
	h.cookie(c, h.Config.SessionCookie(), token, view.Session.AbsoluteExpiresAt)
	h.logger.Info("dev_login_completed", "member_id", view.Member.ID, "request_id", c.GetRespHeader("X-Request-ID"))
	return c.JSON(view)
}
func (h *Handler) RequireSession(c fiber.Ctx, ctx context.Context) (SessionView, error) {
	token, err := cookieValue(c, h.Config.SessionCookie())
	if err != nil {
		return SessionView{}, err
	}
	return h.Store.Session(ctx, token)
}
func (h *Handler) RequireMutationSession(c fiber.Ctx, ctx context.Context) (SessionView, error) {
	token, err := h.mutation(c)
	if err != nil {
		return SessionView{}, err
	}
	return h.Store.Session(ctx, token)
}
func (h *Handler) session(c fiber.Ctx, ctx context.Context) error {
	view, err := h.RequireSession(c, ctx)
	if err != nil {
		return err
	}
	return c.JSON(view)
}
func (h *Handler) logout(c fiber.Ctx, ctx context.Context, all bool) error {
	token, err := h.mutation(c)
	if err != nil {
		return err
	}
	if err = h.Store.Logout(ctx, token, all); err != nil {
		return err
	}
	h.cookie(c, h.Config.SessionCookie(), "", time.Time{})
	return c.Status(204).Send(nil)
}
func (h *Handler) reauthenticate(c fiber.Ctx, ctx context.Context) error {
	token, err := h.mutation(c)
	if err != nil {
		return err
	}
	if !h.allow(c) {
		return errRate
	}
	if !strings.HasPrefix(strings.ToLower(c.Get("Content-Type")), "application/json") || len(c.Body()) > 2048 || uniqueObject(c.Body()) != nil {
		return errRequest
	}
	var body struct {
		Provider string `json:"provider"`
		ReturnTo string `json:"returnTo"`
	}
	decoder := json.NewDecoder(bytes.NewReader(c.Body()))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&body) != nil {
		return errRequest
	}
	view, err := h.Store.Session(ctx, token)
	if err != nil {
		return err
	}
	location, err := h.begin(c, ctx, body.Provider, body.ReturnTo, token, &view.Member.ID)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"authorizationUrl": location})
}

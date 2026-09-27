package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
)

var expoToken = regexp.MustCompile(`^(Expo|Exponent)PushToken\[[a-zA-Z0-9_-]{10,240}\]$`)

type Handler struct {
	Pool   *pgxpool.Pool
	Auth   *auth.Handler
	Logger *slog.Logger
}

func Register(app *fiber.App, pool *pgxpool.Pool, authHandler *auth.Handler, logger *slog.Logger) {
	h := &Handler{Pool: pool, Auth: authHandler, Logger: logger}
	app.Post("/api/v1/me/push-devices", h.register)
	app.Delete("/api/v1/me/push-devices", h.unregister)
}

func (h *Handler) session(c fiber.Ctx) (context.Context, context.CancelFunc, string, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return ctx, cancel, "", "", err
	}
	hash, err := h.Auth.SessionTokenHash(c)
	return ctx, cancel, view.Member.ID, hash, err
}

func decodeToken(c fiber.Ctx) (string, string, error) {
	if !strings.HasPrefix(strings.ToLower(c.Get("Content-Type")), "application/json") || len(c.Body()) == 0 || len(c.Body()) > 512 {
		return "", "", errors.New("invalid request")
	}
	var input struct {
		Token    string `json:"token"`
		Platform string `json:"platform"`
	}
	d := json.NewDecoder(bytes.NewReader(c.Body()))
	d.DisallowUnknownFields()
	if d.Decode(&input) != nil {
		return "", "", errors.New("invalid request")
	}
	var extra any
	if !errors.Is(d.Decode(&extra), io.EOF) || !expoToken.MatchString(input.Token) {
		return "", "", errors.New("invalid request")
	}
	return input.Token, input.Platform, nil
}

func (h *Handler) register(c fiber.Ctx) error {
	ctx, cancel, member, hash, err := h.session(c)
	defer cancel()
	if err != nil {
		return authError(c, err)
	}
	token, platform, err := decodeToken(c)
	if err != nil || (platform != "ios" && platform != "android") {
		return c.Status(400).JSON(fiber.Map{"code": "PUSH_INVALID", "message": "Invalid Expo push token or platform"})
	}
	tx, err := h.Pool.Begin(ctx)
	if err != nil {
		return h.failure(c)
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, `SELECT set_config('summergear.member_id',$1,true)`, member); err != nil {
		return h.failure(c)
	}
	var deviceID string
	if err = tx.QueryRow(ctx, `SELECT summergear_app.register_push_device($1,$2,$3,$4)::text`, member, hash, token, platform).Scan(&deviceID); err != nil {
		return h.failure(c)
	}
	if err = tx.Commit(ctx); err != nil {
		return h.failure(c)
	}
	return c.JSON(fiber.Map{"registered": true})
}

func (h *Handler) unregister(c fiber.Ctx) error {
	ctx, cancel, member, hash, err := h.session(c)
	defer cancel()
	if err != nil {
		return authError(c, err)
	}
	token, _, err := decodeToken(c)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"code": "PUSH_INVALID", "message": "Invalid Expo push token"})
	}
	tx, err := h.Pool.Begin(ctx)
	if err != nil {
		return h.failure(c)
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, `SELECT set_config('summergear.member_id',$1,true)`, member); err != nil {
		return h.failure(c)
	}
	if _, err = tx.Exec(ctx, `UPDATE summergear_app.push_devices SET active=false,updated_at=clock_timestamp()
 WHERE member_id=$1 AND session_hash=$2 AND token=$3 AND active`, member, hash, token); err != nil {
		return h.failure(c)
	}
	if err = tx.Commit(ctx); err != nil {
		return h.failure(c)
	}
	return c.SendStatus(204)
}

func authError(c fiber.Ctx, err error) error {
	failure := auth.PublicFailure(err)
	return c.Status(failure.Status).JSON(fiber.Map{"code": failure.Code, "message": failure.Message})
}
func (h *Handler) failure(c fiber.Ctx) error {
	h.Logger.Error("push_device_database_failure")
	return c.Status(503).JSON(fiber.Map{"code": "PUSH_UNAVAILABLE", "message": "Push registration unavailable"})
}

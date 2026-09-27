package recovery

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
	"github.com/riverqueue/river"
)

type Handler struct {
	Service *Service
	Auth    *auth.Handler
	Logger  *slog.Logger
}

func Register(app *fiber.App, pool *pgxpool.Pool, authHandler *auth.Handler, queue *river.Client[pgx.Tx], logger *slog.Logger) {
	h := &Handler{Service: &Service{Pool: pool, Client: queue}, Auth: authHandler, Logger: logger}
	app.Get("/api/v1/operator/recovery", h.wrap(h.dashboard))
	app.Post("/api/v1/operator/recovery/:id/recheck", h.wrap(h.recheck))
}
func (h *Handler) wrap(fn func(fiber.Ctx, context.Context) error) fiber.Handler {
	return func(c fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := fn(c, ctx); err != nil {
			var f *Failure
			if errors.As(err, &f) {
				return c.Status(f.Status).JSON(fiber.Map{"code": f.Code, "message": f.Message})
			}
			failure := auth.PublicFailure(err)
			return c.Status(failure.Status).JSON(fiber.Map{"code": failure.Code, "message": failure.Message})
		}
		return nil
	}
}
func (h *Handler) dashboard(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireSession(c, ctx)
	if err != nil {
		return err
	}
	result, err := h.Service.Dashboard(ctx, view.Member.ID)
	if err != nil {
		return err
	}
	c.Set("Cache-Control", "no-store")
	return c.JSON(result)
}
func (h *Handler) recheck(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	if !strings.HasPrefix(strings.ToLower(c.Get("Content-Type")), "application/json") || len(c.Body()) == 0 || len(c.Body()) > 1024 {
		return invalid
	}
	var input struct {
		Reason string `json:"reason"`
	}
	d := json.NewDecoder(bytes.NewReader(c.Body()))
	d.DisallowUnknownFields()
	if d.Decode(&input) != nil {
		return invalid
	}
	var extra any
	if !errors.Is(d.Decode(&extra), io.EOF) {
		return invalid
	}
	result, err := h.Service.Recheck(ctx, view.Member.ID, c.Params("id"), input.Reason)
	if err != nil {
		return err
	}
	return c.Status(202).JSON(result)
}

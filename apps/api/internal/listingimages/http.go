package listingimages

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
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
)

type SessionAuth interface {
	RequireSession(fiber.Ctx, context.Context) (auth.SessionView, error)
	RequireMutationSession(fiber.Ctx, context.Context) (auth.SessionView, error)
}

type Handler struct {
	Service *Service
	Auth    SessionAuth
	logger  *slog.Logger
}

func Register(app *fiber.App, pool *pgxpool.Pool, authHandler *auth.Handler, storage Storage, logger *slog.Logger) *Handler {
	h := &Handler{
		Service: &Service{Repo: &Store{Pool: pool}, Storage: storage},
		Auth:    authHandler,
		logger:  logger,
	}
	app.Get(Prefix+"/:id/images", h.wrap(h.list))
	app.Post(Prefix+"/:id/images/uploads", h.wrap(h.startUpload))
	app.Post(Prefix+"/:id/images/:imageId/complete", h.wrap(h.complete))
	app.Delete(Prefix+"/:id/images/:imageId", h.wrap(h.delete))
	if pool != nil && storage != nil {
		if _, unavailable := storage.(unavailableStorage); !unavailable {
			recoveryCtx, cancelRecovery := context.WithCancel(context.Background())
			app.Hooks().OnPreShutdown(func() error {
				cancelRecovery()
				return nil
			})
			go h.Service.RunRecoveryLoop(recoveryCtx, logger)
		}
	}
	return h
}

func (h *Handler) wrap(fn func(fiber.Ctx, context.Context) error) fiber.Handler {
	return func(c fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.Context(), 12*time.Second)
		defer cancel()
		if err := fn(c, ctx); err != nil {
			return h.respond(c, err)
		}
		return nil
	}
}

func (h *Handler) respond(c fiber.Ctx, err error) error {
	var failure *Failure
	if errors.As(err, &failure) {
		if failure.Status >= 500 {
			h.logger.Error("image_request_failed", "error_code", failure.Code, "request_id", c.GetRespHeader("X-Request-ID"))
		}
		return c.Status(failure.Status).JSON(fiber.Map{
			"code": failure.Code, "message": failure.Message, "requestId": c.GetRespHeader("X-Request-ID"),
		})
	}
	authFailure := auth.PublicFailure(err)
	return c.Status(authFailure.Status).JSON(fiber.Map{
		"code": authFailure.Code, "message": authFailure.Message, "requestId": c.GetRespHeader("X-Request-ID"),
	})
}

func (h *Handler) list(c fiber.Ctx, ctx context.Context) error {
	memberID := ""
	view, err := h.Auth.RequireSession(c, ctx)
	if err == nil {
		memberID = view.Member.ID
	} else if auth.PublicFailure(err).Code != "UNAUTHENTICATED" {
		return err
	}
	items, err := h.Service.List(ctx, c.Params("id"), memberID)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"listingId": c.Params("id"), "images": items})
}

func (h *Handler) startUpload(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	var input UploadInput
	if err := decodeBody(c, &input); err != nil {
		return err
	}
	slot, err := h.Service.StartUpload(ctx, view.Member.ID, c.Params("id"), input)
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(slot)
}

func (h *Handler) complete(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	if len(c.Body()) != 0 {
		return errInvalid
	}
	result, err := h.Service.Complete(ctx, view.Member.ID, c.Params("id"), c.Params("imageId"))
	if err != nil {
		return err
	}
	return c.JSON(result)
}

func (h *Handler) delete(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	if len(c.Body()) != 0 {
		return errInvalid
	}
	if err := h.Service.Delete(ctx, view.Member.ID, c.Params("id"), c.Params("imageId")); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func decodeBody(c fiber.Ctx, target any) error {
	if !strings.HasPrefix(strings.ToLower(c.Get("Content-Type")), "application/json") ||
		len(c.Body()) == 0 || len(c.Body()) > 8*1024 {
		return errInvalid
	}
	decoder := json.NewDecoder(bytes.NewReader(c.Body()))
	decoder.DisallowUnknownFields()
	if decoder.Decode(target) != nil {
		return errInvalid
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return errInvalid
	}
	return nil
}

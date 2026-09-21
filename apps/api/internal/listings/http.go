package listings

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
	"github.com/lulupang2/social_commerce/apps/api/internal/listingimages"
)

type ImageReader interface {
	ListVisible(context.Context, string, string) ([]listingimages.View, error)
}

type Handler struct {
	Store  *Store
	Auth   *auth.Handler
	Images ImageReader
	logger *slog.Logger
}

func Register(app *fiber.App, pool *pgxpool.Pool, authHandler *auth.Handler, images ImageReader, logger *slog.Logger) *Handler {
	h := &Handler{Store: &Store{Pool: pool}, Auth: authHandler, Images: images, logger: logger}
	app.Get(Prefix, h.wrap(h.list))
	app.Get(Prefix+"/:id", h.wrap(h.get))
	app.Post(Prefix, h.wrap(h.create))
	app.Patch(Prefix+"/:id", h.wrap(h.update))
	return h
}

func (h *Handler) wrap(fn func(fiber.Ctx, context.Context) error) fiber.Handler {
	return func(c fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
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
			h.logger.Error("listing_request_failed", "error_code", failure.Code, "request_id", c.GetRespHeader("X-Request-ID"))
		}
		return c.Status(failure.Status).JSON(fiber.Map{
			"code": failure.Code, "message": failure.Message, "requestId": c.GetRespHeader("X-Request-ID"),
		})
	}
	var imageFailure *listingimages.Failure
	if errors.As(err, &imageFailure) {
		if imageFailure.Status >= 500 {
			h.logger.Error("listing_image_dependency_failed", "error_code", imageFailure.Code, "request_id", c.GetRespHeader("X-Request-ID"))
		}
		return c.Status(imageFailure.Status).JSON(fiber.Map{
			"code": imageFailure.Code, "message": imageFailure.Message, "requestId": c.GetRespHeader("X-Request-ID"),
		})
	}
	authFailure := auth.PublicFailure(err)
	return c.Status(authFailure.Status).JSON(fiber.Map{
		"code": authFailure.Code, "message": authFailure.Message, "requestId": c.GetRespHeader("X-Request-ID"),
	})
}

func (h *Handler) list(c fiber.Ctx, ctx context.Context) error {
	q := c.Queries()
	for key := range q {
		if key != "sport" && key != "category" && key != "search" {
			return errInvalid
		}
	}
	items, err := h.Store.List(ctx, Filters{Sport: q["sport"], Category: q["category"], Search: q["search"]})
	if err != nil {
		return err
	}
	for i := range items {
		if err := h.attachImages(ctx, &items[i], ""); err != nil {
			return err
		}
	}
	return c.JSON(fiber.Map{"items": items})
}

func (h *Handler) get(c fiber.Ctx, ctx context.Context) error {
	memberID := ""
	view, err := h.Auth.RequireSession(c, ctx)
	if err == nil {
		memberID = view.Member.ID
	} else if auth.PublicFailure(err).Code != "UNAUTHENTICATED" {
		return err
	}
	item, err := h.Store.Get(ctx, c.Params("id"), memberID)
	if err != nil {
		return err
	}
	if err = h.attachImages(ctx, &item, memberID); err != nil {
		return err
	}
	return c.JSON(item)
}

func (h *Handler) create(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	var input CreateInput
	if err := decodeBody(c, &input); err != nil {
		return err
	}
	item, err := h.Store.Create(ctx, view.Member.ID, input)
	if err != nil {
		return err
	}
	if err = h.attachImages(ctx, &item, view.Member.ID); err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(item)
}

func (h *Handler) update(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	var input UpdateInput
	if err := decodeBody(c, &input); err != nil {
		return err
	}
	item, err := h.Store.Update(ctx, view.Member.ID, c.Params("id"), input)
	if err != nil {
		return err
	}
	if err = h.attachImages(ctx, &item, view.Member.ID); err != nil {
		return err
	}
	return c.JSON(item)
}

func (h *Handler) attachImages(ctx context.Context, item *Listing, memberID string) error {
	images, err := h.Images.ListVisible(ctx, item.ID, memberID)
	if err != nil {
		return err
	}
	item.Images = images
	return nil
}

func decodeBody(c fiber.Ctx, target any) error {
	if !strings.HasPrefix(strings.ToLower(c.Get("Content-Type")), "application/json") || len(c.Body()) == 0 || len(c.Body()) > 32*1024 {
		return errInvalid
	}
	decoder := json.NewDecoder(bytes.NewReader(c.Body()))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return errInvalid
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return errInvalid
	}
	return nil
}

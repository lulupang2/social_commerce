package listings

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
	"github.com/lulupang2/social_commerce/apps/api/internal/listingimages"
)

type ImageReader interface {
	List(context.Context, string, string) ([]listingimages.View, error)
}

var _ ImageReader = (*listingimages.Service)(nil)

type Handler struct {
	Store  *Store
	Auth   *auth.Handler
	Images ImageReader
	logger *slog.Logger
}

func Register(app *fiber.App, pool *pgxpool.Pool, authHandler *auth.Handler, images ImageReader, logger *slog.Logger) *Handler {
	h := &Handler{Store: &Store{Pool: pool}, Auth: authHandler, Images: images, logger: logger}
	app.Get(Prefix, h.wrap(h.list))
	app.Get(Prefix+"/:id/availability", h.wrap(h.availability))
	app.Get(Prefix+"/:id/reviews", h.wrap(h.reviewHistory))
	app.Post(Prefix+"/:id/resubmit", h.wrap(h.resubmit))
	app.Get("/api/v1/reviews", h.wrap(h.reviewQueue))
	app.Post("/api/v1/reviews/:id/approve", h.wrap(h.approve))
	app.Post("/api/v1/reviews/:id/reject", h.wrap(h.reject))
	app.Get("/api/v1/me/seller-application", h.wrap(h.mySellerStatus))
	app.Post("/api/v1/me/seller-application", h.wrap(h.applySeller))
	app.Get("/api/v1/seller-applications", h.wrap(h.sellerApplications))
	app.Post("/api/v1/seller-applications/:id/approve", h.wrap(h.approveSeller))
	app.Post("/api/v1/seller-applications/:id/reject", h.wrap(h.rejectSeller))
	app.Get(Prefix+"/:id/inventory", h.wrap(h.ownerInventory))
	app.Put(Prefix+"/:id/inventory", h.wrap(h.setInventory))
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
	raw := string(c.Request().URI().QueryString())
	if len(raw) > 4096 {
		return errInvalid
	}
	q, parseErr := url.ParseQuery(raw)
	if parseErr != nil {
		return errInvalid
	}
	for key, values := range q {
		if len(values) != 1 || !oneOf(key, "sport", "category", "search", "location", "minPrice", "maxPrice", "sort", "limit", "cursor") {
			return errInvalid
		}
	}
	price := func(name string) (*int64, error) {
		value, present := q[name]
		if !present {
			return nil, nil
		}
		if len(value[0]) == 0 || len(value[0]) > 12 {
			return nil, errInvalid
		}
		for _, digit := range value[0] {
			if digit < '0' || digit > '9' {
				return nil, errInvalid
			}
		}
		amount, err := strconv.ParseInt(value[0], 10, 64)
		if err != nil {
			return nil, errInvalid
		}
		return &amount, nil
	}
	minPrice, err := price("minPrice")
	if err != nil {
		return err
	}
	maxPrice, err := price("maxPrice")
	if err != nil {
		return err
	}
	limit := 24
	if _, present := q["limit"]; present {
		limit, err = strconv.Atoi(q.Get("limit"))
		if err != nil || limit < 1 || limit > 50 {
			return errInvalid
		}
	}
	page, err := h.Store.ListPage(ctx, PageQuery{Filters: Filters{
		Sport: q.Get("sport"), Category: q.Get("category"), Search: q.Get("search"),
		Location: q.Get("location"), MinPrice: minPrice, MaxPrice: maxPrice, Sort: q.Get("sort"),
	}, Limit: limit, Cursor: q.Get("cursor")})
	if err != nil {
		return err
	}
	for i := range page.Items {
		if err := h.attachImages(ctx, &page.Items[i], ""); err != nil {
			return err
		}
	}
	return c.JSON(page)
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
	images, err := h.Images.List(ctx, item.ID, memberID)
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

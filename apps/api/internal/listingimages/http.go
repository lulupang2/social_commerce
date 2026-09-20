package listingimages

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
)

type SessionAuthenticator interface {
	RequireSession(fiber.Ctx, context.Context) (auth.SessionView, error)
	RequireMutationSession(fiber.Ctx, context.Context) (auth.SessionView, error)
}

type Handler struct {
	Service *Service
	Auth    SessionAuthenticator
	logger  *slog.Logger
}

func Register(app *fiber.App, authHandler SessionAuthenticator, service *Service, logger *slog.Logger) *Handler {
	h := &Handler{Service: service, Auth: authHandler, logger: logger}
	app.Get(Prefix+"/:listingId/images", h.wrap(h.list))
	app.Post(Prefix+"/:listingId/images", h.wrap(h.create))
	app.Patch(Prefix+"/:listingId/images/:imageId", h.wrap(h.patch))
	app.Put(Prefix+"/:listingId/images/:imageId", h.wrap(h.replace))
	app.Delete(Prefix+"/:listingId/images/:imageId", h.wrap(h.delete))
	return h
}

func (h *Handler) wrap(fn func(fiber.Ctx, context.Context) error) fiber.Handler {
	return func(c fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
		defer cancel()
		if err := fn(c, ctx); err != nil {
			return h.respond(c, err)
		}
		return nil
	}
}

func (h *Handler) respond(c fiber.Ctx, err error) error {
	if failure, ok := asFailure(err); ok {
		if failure.Status >= 500 {
			h.logger.Error("listing_image_request_failed", "error_code", failure.Code, "request_id", c.GetRespHeader("X-Request-ID"))
		}
		return c.Status(failure.Status).JSON(fiber.Map{
			"code": failure.Code, "message": failure.Message, "requestId": c.GetRespHeader("X-Request-ID"),
		})
	}
	failure := auth.PublicFailure(err)
	return c.Status(failure.Status).JSON(fiber.Map{
		"code": failure.Code, "message": failure.Message, "requestId": c.GetRespHeader("X-Request-ID"),
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
	images, err := h.Service.ListVisible(ctx, c.Params("listingId"), memberID)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"listingId": c.Params("listingId"), "images": images})
}

func (h *Handler) create(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	file, altSet, altText, sortOrder, err := parseMultipart(c, true)
	if err != nil {
		return err
	}
	_ = altSet
	image, err := h.Service.Create(ctx, view.Member.ID, c.Params("listingId"), CreateInput{
		File: file, AltText: altText, SortOrder: sortOrder,
	})
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(image)
}

func (h *Handler) patch(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	input, err := decodePatch(c)
	if err != nil {
		return err
	}
	image, err := h.Service.Patch(ctx, view.Member.ID, c.Params("listingId"), c.Params("imageId"), input)
	if err != nil {
		return err
	}
	return c.JSON(image)
}

func (h *Handler) replace(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	file, altSet, altText, _, err := parseMultipart(c, false)
	if err != nil {
		return err
	}
	image, err := h.Service.Replace(ctx, view.Member.ID, c.Params("listingId"), c.Params("imageId"), ReplaceInput{
		File: file, AltTextSet: altSet, AltText: altText,
	})
	if err != nil {
		return err
	}
	return c.JSON(image)
}

func (h *Handler) delete(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	if len(c.Body()) != 0 {
		return errInvalid
	}
	if err := h.Service.Delete(ctx, view.Member.ID, c.Params("listingId"), c.Params("imageId")); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func parseMultipart(c fiber.Ctx, allowSort bool) (ImageFile, bool, *string, *int, error) {
	mediaType, params, err := mime.ParseMediaType(c.Get("Content-Type"))
	if err != nil || mediaType != "multipart/form-data" || params["boundary"] == "" {
		return ImageFile{}, false, nil, nil, errInvalid
	}
	form, err := c.MultipartForm()
	if err != nil {
		return ImageFile{}, false, nil, nil, errInvalid
	}
	defer form.RemoveAll()
	for key := range form.File {
		if key != "file" {
			return ImageFile{}, false, nil, nil, errInvalid
		}
	}
	files := form.File["file"]
	if len(files) != 1 {
		return ImageFile{}, false, nil, nil, errInvalid
	}
	for key, values := range form.Value {
		if key != "altText" && (key != "sortOrder" || !allowSort) {
			return ImageFile{}, false, nil, nil, errInvalid
		}
		if len(values) != 1 {
			return ImageFile{}, false, nil, nil, errInvalid
		}
	}

	header := files[0]
	if header.Size > MaxFileSizeBytes {
		return ImageFile{}, false, nil, nil, errTooLarge
	}
	file, err := header.Open()
	if err != nil {
		return ImageFile{}, false, nil, nil, errInvalid
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, MaxFileSizeBytes+1))
	if err != nil {
		return ImageFile{}, false, nil, nil, errInvalid
	}
	if len(data) > MaxFileSizeBytes {
		return ImageFile{}, false, nil, nil, errTooLarge
	}
	image, err := inspectImage(data, header.Header.Get("Content-Type"))
	if err != nil {
		return ImageFile{}, false, nil, nil, err
	}

	var altText *string
	altSet := false
	if values, ok := form.Value["altText"]; ok {
		altSet = true
		value := values[0]
		altText = &value
	}
	var sortOrder *int
	if values, ok := form.Value["sortOrder"]; ok {
		value, parseErr := strconv.Atoi(strings.TrimSpace(values[0]))
		if parseErr != nil || value < 0 {
			return ImageFile{}, false, nil, nil, errInvalid
		}
		sortOrder = &value
	}
	return image, altSet, altText, sortOrder, nil
}

func decodePatch(c fiber.Ctx) (PatchInput, error) {
	if !strings.HasPrefix(strings.ToLower(c.Get("Content-Type")), "application/json") ||
		len(c.Body()) == 0 || len(c.Body()) > 4096 {
		return PatchInput{}, errInvalid
	}
	var payload patchPayload
	decoder := json.NewDecoder(bytes.NewReader(c.Body()))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		return PatchInput{}, errInvalid
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return PatchInput{}, errInvalid
	}
	input := PatchInput{
		AltTextSet: payload.AltText.Set,
		AltText:    payload.AltText.Value,
		SortOrder:  payload.SortOrder,
	}
	if !input.AltTextSet && input.SortOrder == nil {
		return PatchInput{}, errInvalid
	}
	return input, nil
}

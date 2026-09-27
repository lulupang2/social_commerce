package memberdata

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
	"github.com/lulupang2/social_commerce/apps/api/internal/listingimages"
	"github.com/lulupang2/social_commerce/apps/api/internal/listings"
)

const Prefix = "/api/v1/me"

type ImageReader interface {
	List(context.Context, string, string) ([]listingimages.View, error)
}
type Handler struct {
	Store    *Store
	Listings *listings.Store
	Images   ImageReader
	Auth     *auth.Handler
	logger   *slog.Logger
}

func Register(app *fiber.App, pool *pgxpool.Pool, authHandler *auth.Handler, images ImageReader, logger *slog.Logger) *Handler {
	h := &Handler{Store: &Store{Pool: pool}, Listings: &listings.Store{Pool: pool}, Images: images, Auth: authHandler, logger: logger}
	app.Get("/api/v1/recommendations", h.wrap(h.recommendations))
	app.Get(Prefix, h.wrap(h.profile))
	app.Put(Prefix, h.wrap(h.saveProfile))
	app.Get(Prefix+"/listings", h.wrap(h.myListings))
	app.Get(Prefix+"/favorites", h.wrap(h.favorites))
	app.Put(Prefix+"/favorites/:id", h.wrap(h.addFavorite))
	app.Delete(Prefix+"/favorites/:id", h.wrap(h.removeFavorite))
	return h
}
func (h *Handler) wrap(fn func(fiber.Ctx, context.Context) error) fiber.Handler {
	return func(c fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		err := fn(c, ctx)
		if err == nil {
			return nil
		}
		status, code, message := fiber.StatusServiceUnavailable, "MEMBER_DATA_UNAVAILABLE", "회원 데이터를 불러오지 못했어요. 다시 시도해 주세요."
		if errors.Is(err, pgx.ErrNoRows) {
			status, code, message = 404, "LISTING_NOT_FOUND", "공개된 매물을 찾을 수 없어요."
		} else if errors.Is(err, errInput) {
			status, code, message = 400, "INVALID_INPUT", "입력값을 확인해 주세요."
		} else if failure := auth.PublicFailure(err); failure.Status != 500 {
			status, code, message = failure.Status, failure.Code, failure.Message
		}
		if status >= 500 {
			h.logger.Error("member_data_failed", "code", code, "request_id", c.GetRespHeader("X-Request-ID"))
		}
		return c.Status(status).JSON(fiber.Map{"code": code, "message": message, "requestId": c.GetRespHeader("X-Request-ID")})
	}
}

var errInput = errors.New("invalid member data")

func (h *Handler) profile(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireSession(c, ctx)
	if err != nil {
		return err
	}
	p, err := h.Store.Profile(ctx, view.Member.ID)
	if err != nil {
		return err
	}
	return c.JSON(p)
}
func validSkill(value string) bool {
	switch value {
	case "beginner", "intermediate", "advanced", "expert":
		return true
	}
	return false
}
func (h *Handler) saveProfile(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	if !strings.HasPrefix(strings.ToLower(c.Get("Content-Type")), "application/json") || len(c.Body()) == 0 || len(c.Body()) > 1024 {
		return errInput
	}
	var input struct {
		DisplayName     string  `json:"displayName"`
		SurfSkill       string  `json:"surfSkill"`
		TennisSkill     string  `json:"tennisSkill"`
		PreferredSport  *string `json:"preferredSport"`
		MaxBudgetKRW    *int64  `json:"maxBudgetKrw"`
		PreferredRegion string  `json:"preferredRegion"`
	}
	dec := json.NewDecoder(bytes.NewReader(c.Body()))
	dec.DisallowUnknownFields()
	if dec.Decode(&input) != nil {
		return errInput
	}
	var extra any
	if !errors.Is(dec.Decode(&extra), io.EOF) {
		return errInput
	}
	input.DisplayName = strings.TrimSpace(input.DisplayName)
	input.PreferredRegion = strings.TrimSpace(input.PreferredRegion)
	if utf8.RuneCountInString(input.DisplayName) < 1 || utf8.RuneCountInString(input.DisplayName) > 80 || !validSkill(input.SurfSkill) || !validSkill(input.TennisSkill) ||
		input.PreferredSport != nil && *input.PreferredSport != "surf" && *input.PreferredSport != "tennis" ||
		input.MaxBudgetKRW != nil && (*input.MaxBudgetKRW < 1 || *input.MaxBudgetKRW > 999999999999) ||
		utf8.RuneCountInString(input.PreferredRegion) > 120 {
		return errInput
	}
	p, err := h.Store.Update(ctx, view.Member.ID, input.DisplayName, input.SurfSkill, input.TennisSkill, input.PreferredSport, input.MaxBudgetKRW, input.PreferredRegion)
	if err != nil {
		return err
	}
	return c.JSON(p)
}
func (h *Handler) myListings(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireSession(c, ctx)
	if err != nil {
		return err
	}
	items, err := h.Listings.ListOwned(ctx, view.Member.ID)
	if err != nil {
		return err
	}
	for i := range items {
		items[i].Images, err = h.Images.List(ctx, items[i].ID, view.Member.ID)
		if err != nil {
			return err
		}
	}
	return c.JSON(fiber.Map{"items": items})
}
func (h *Handler) favorites(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireSession(c, ctx)
	if err != nil {
		return err
	}
	ids, err := h.Store.FavoriteIDs(ctx, view.Member.ID)
	if err != nil {
		return err
	}
	items := make([]listings.Listing, 0, len(ids))
	for _, id := range ids {
		item, loadErr := h.Listings.Get(ctx, id, view.Member.ID)
		if loadErr != nil {
			return loadErr
		}
		item.Images, loadErr = h.Images.List(ctx, id, view.Member.ID)
		if loadErr != nil {
			return loadErr
		}
		items = append(items, item)
	}
	return c.JSON(fiber.Map{"items": items})
}
func (h *Handler) mutateFavorite(c fiber.Ctx, ctx context.Context, favorite bool) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	id := c.Params("id")
	if _, err = uuid.Parse(id); err != nil || len(c.Body()) != 0 {
		return errInput
	}
	saved, err := h.Store.SetFavorite(ctx, view.Member.ID, id, favorite)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"listingId": id, "favorite": saved})
}
func (h *Handler) addFavorite(c fiber.Ctx, ctx context.Context) error {
	return h.mutateFavorite(c, ctx, true)
}
func (h *Handler) removeFavorite(c fiber.Ctx, ctx context.Context) error {
	return h.mutateFavorite(c, ctx, false)
}

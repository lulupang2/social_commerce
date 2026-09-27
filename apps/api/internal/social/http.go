package social

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
)

type Handler struct {
	Store  *Store
	Auth   *auth.Handler
	logger *slog.Logger
}

func Register(app *fiber.App, pool *pgxpool.Pool, authHandler *auth.Handler, logger *slog.Logger) *Handler {
	h := &Handler{Store: &Store{Pool: pool}, Auth: authHandler, logger: logger}
	app.Get("/api/v1/conversations", h.wrap(h.conversations))
	app.Post("/api/v1/conversations", h.wrap(h.start))
	app.Get("/api/v1/conversations/:id", h.wrap(h.conversation))
	app.Post("/api/v1/conversations/:id/messages", h.wrap(h.send))
	app.Post("/api/v1/conversations/:id/read", h.wrap(h.read))
	app.Get("/api/v1/community/posts", h.wrap(h.posts))
	app.Get("/api/v1/community/reviews", h.wrap(h.reviewQueue))
	app.Post("/api/v1/community/reviews/:id/approve", h.wrap(h.approve))
	app.Post("/api/v1/community/reviews/:id/reject", h.wrap(h.reject))
	app.Get("/api/v1/me/posts", h.wrap(h.myPosts))
	app.Post("/api/v1/community/posts", h.wrap(h.createPost))
	app.Get("/api/v1/community/posts/:id/comments", h.wrap(h.comments))
	app.Post("/api/v1/community/posts/:id/comments", h.wrap(h.addComment))
	app.Put("/api/v1/community/posts/:id/like", h.wrap(h.like))
	app.Delete("/api/v1/community/posts/:id/like", h.wrap(h.unlike))
	app.Post("/api/v1/community/posts/:id/resubmit", h.wrap(h.resubmit))
	app.Get("/api/v1/community/posts/:id", h.wrap(h.post))
	app.Patch("/api/v1/community/posts/:id", h.wrap(h.updatePost))
	return h
}
func (h *Handler) wrap(fn func(fiber.Ctx, context.Context) error) fiber.Handler {
	return func(c fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := fn(c, ctx); err != nil {
			var failure *Failure
			if errors.As(err, &failure) {
				if failure.Status >= 500 {
					h.logger.Error("social_request_failed", "code", failure.Code)
				}
				return c.Status(failure.Status).JSON(fiber.Map{"code": failure.Code, "message": failure.Message})
			}
			af := auth.PublicFailure(err)
			return c.Status(af.Status).JSON(fiber.Map{"code": af.Code, "message": af.Message})
		}
		return nil
	}
}
func (h *Handler) member(c fiber.Ctx, ctx context.Context, mutation bool) (string, error) {
	if mutation {
		v, e := h.Auth.RequireMutationSession(c, ctx)
		if e != nil {
			return "", e
		}
		return v.Member.ID, nil
	}
	v, e := h.Auth.RequireSession(c, ctx)
	if e != nil {
		return "", e
	}
	return v.Member.ID, nil
}
func (h *Handler) reviewer(c fiber.Ctx, ctx context.Context, mutation bool) (string, error) {
	id, err := h.member(c, ctx, mutation)
	if err != nil {
		return "", err
	}
	return id, nil
}
func decode(c fiber.Ctx, target any) error {
	if !strings.HasPrefix(strings.ToLower(c.Get("Content-Type")), "application/json") || len(c.Body()) == 0 || len(c.Body()) > 16384 {
		return invalid
	}
	d := json.NewDecoder(bytes.NewReader(c.Body()))
	d.DisallowUnknownFields()
	if d.Decode(target) != nil {
		return invalid
	}
	var extra any
	if !errors.Is(d.Decode(&extra), io.EOF) {
		return invalid
	}
	return nil
}
func empty(c fiber.Ctx) error {
	if len(c.Body()) > 0 {
		return invalid
	}
	return nil
}
func (h *Handler) start(c fiber.Ctx, ctx context.Context) error {
	member, err := h.member(c, ctx, true)
	if err != nil {
		return err
	}
	var input struct {
		ListingID string `json:"listingId"`
	}
	if err = decode(c, &input); err != nil {
		return err
	}
	id, err := h.Store.StartConversation(ctx, member, input.ListingID)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"conversationId": id})
}
func (h *Handler) conversations(c fiber.Ctx, ctx context.Context) error {
	member, err := h.member(c, ctx, false)
	if err != nil {
		return err
	}
	items, err := h.Store.ListConversations(ctx, member)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"items": items})
}
func (h *Handler) conversation(c fiber.Ctx, ctx context.Context) error {
	member, err := h.member(c, ctx, false)
	if err != nil {
		return err
	}
	limit := 30
	if raw := c.Query("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
		if err != nil {
			return invalid
		}
	}
	view, err := h.Store.Conversation(ctx, member, c.Params("id"), c.Query("before"), c.Query("after"), limit)
	if err != nil {
		return err
	}
	return c.JSON(view)
}
func (h *Handler) send(c fiber.Ctx, ctx context.Context) error {
	member, err := h.member(c, ctx, true)
	if err != nil {
		return err
	}
	var input struct {
		Body        string `json:"body"`
		ClientNonce string `json:"clientNonce"`
	}
	if err = decode(c, &input); err != nil {
		return err
	}
	message, err := h.Store.SendMessage(ctx, member, c.Params("id"), input.ClientNonce, input.Body)
	if err != nil {
		return err
	}
	return c.Status(201).JSON(message)
}
func (h *Handler) read(c fiber.Ctx, ctx context.Context) error {
	member, err := h.member(c, ctx, true)
	if err != nil {
		return err
	}
	var input struct {
		ThroughMessageID string `json:"throughMessageId"`
	}
	if err = decode(c, &input); err != nil {
		return err
	}
	if err = h.Store.MarkRead(ctx, member, c.Params("id"), input.ThroughMessageID); err != nil {
		return err
	}
	return c.SendStatus(204)
}
func (h *Handler) posts(c fiber.Ctx, ctx context.Context) error {
	member := ""
	if view, err := h.Auth.RequireSession(c, ctx); err == nil {
		member = view.Member.ID
	}
	items, err := h.Store.PublicPosts(ctx, member)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"items": items})
}
func (h *Handler) myPosts(c fiber.Ctx, ctx context.Context) error {
	member, err := h.member(c, ctx, false)
	if err != nil {
		return err
	}
	items, err := h.Store.MyPosts(ctx, member)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"items": items})
}
func (h *Handler) post(c fiber.Ctx, ctx context.Context) error {
	member := ""
	if view, err := h.Auth.RequireSession(c, ctx); err == nil {
		member = view.Member.ID
	}
	item, err := h.Store.Post(ctx, member, c.Params("id"))
	if err != nil {
		return err
	}
	return c.JSON(item)
}
func (h *Handler) createPost(c fiber.Ctx, ctx context.Context) error {
	member, err := h.member(c, ctx, true)
	if err != nil {
		return err
	}
	var input struct {
		Sport string `json:"sport"`
		Type  string `json:"type"`
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if err = decode(c, &input); err != nil {
		return err
	}
	item, err := h.Store.CreatePost(ctx, member, input.Sport, input.Type, input.Title, input.Body)
	if err != nil {
		return err
	}
	return c.Status(201).JSON(item)
}
func (h *Handler) updatePost(c fiber.Ctx, ctx context.Context) error {
	member, err := h.member(c, ctx, true)
	if err != nil {
		return err
	}
	var input struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if err = decode(c, &input); err != nil {
		return err
	}
	item, err := h.Store.UpdatePost(ctx, member, c.Params("id"), input.Title, input.Body)
	if err != nil {
		return err
	}
	return c.JSON(item)
}
func (h *Handler) resubmit(c fiber.Ctx, ctx context.Context) error {
	member, err := h.member(c, ctx, true)
	if err != nil {
		return err
	}
	if err = empty(c); err != nil {
		return err
	}
	item, err := h.Store.ResubmitPost(ctx, member, c.Params("id"))
	if err != nil {
		return err
	}
	return c.JSON(item)
}
func (h *Handler) reviewQueue(c fiber.Ctx, ctx context.Context) error {
	reviewer, err := h.reviewer(c, ctx, false)
	if err != nil {
		return err
	}
	items, err := h.Store.PendingPosts(ctx, reviewer)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"items": items})
}
func (h *Handler) review(c fiber.Ctx, ctx context.Context, decision string) error {
	reviewer, err := h.reviewer(c, ctx, true)
	if err != nil {
		return err
	}
	reason := ""
	if decision == "reject" {
		var input struct {
			Reason string `json:"reason"`
		}
		if err = decode(c, &input); err != nil {
			return err
		}
		reason = input.Reason
	} else if err = empty(c); err != nil {
		return err
	}
	item, err := h.Store.ReviewPost(ctx, reviewer, c.Params("id"), decision, reason)
	if err != nil {
		return err
	}
	return c.JSON(item)
}
func (h *Handler) approve(c fiber.Ctx, ctx context.Context) error { return h.review(c, ctx, "approve") }
func (h *Handler) reject(c fiber.Ctx, ctx context.Context) error  { return h.review(c, ctx, "reject") }
func (h *Handler) comments(c fiber.Ctx, ctx context.Context) error {
	if _, err := h.Store.Post(ctx, "", c.Params("id")); err != nil {
		return err
	}
	items, err := h.Store.Comments(ctx, c.Params("id"))
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"items": items})
}
func (h *Handler) addComment(c fiber.Ctx, ctx context.Context) error {
	member, err := h.member(c, ctx, true)
	if err != nil {
		return err
	}
	var input struct {
		Body string `json:"body"`
	}
	if err = decode(c, &input); err != nil {
		return err
	}
	comment, err := h.Store.AddComment(ctx, member, c.Params("id"), input.Body)
	if err != nil {
		return err
	}
	return c.Status(201).JSON(comment)
}
func (h *Handler) reaction(c fiber.Ctx, ctx context.Context, liked bool) error {
	member, err := h.member(c, ctx, true)
	if err != nil {
		return err
	}
	if err = empty(c); err != nil {
		return err
	}
	count, err := h.Store.SetLike(ctx, member, c.Params("id"), liked)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"liked": liked, "likes": count})
}
func (h *Handler) like(c fiber.Ctx, ctx context.Context) error   { return h.reaction(c, ctx, true) }
func (h *Handler) unlike(c fiber.Ctx, ctx context.Context) error { return h.reaction(c, ctx, false) }

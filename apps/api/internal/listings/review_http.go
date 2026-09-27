package listings

import (
	"context"
	"strings"

	"github.com/gofiber/fiber/v3"
)

func (h *Handler) availability(c fiber.Ctx, ctx context.Context) error {
	value, err := h.Store.Availability(ctx, c.Params("id"))
	if err != nil {
		return err
	}
	return c.JSON(value)
}
func (h *Handler) reviewer(c fiber.Ctx, ctx context.Context, mutation bool) (string, error) {
	var id string
	if mutation {
		view, err := h.Auth.RequireMutationSession(c, ctx)
		if err != nil {
			return "", err
		}
		id = view.Member.ID
	} else {
		view, err := h.Auth.RequireSession(c, ctx)
		if err != nil {
			return "", err
		}
		id = view.Member.ID
	}
	return id, nil
}
func (h *Handler) reviewQueue(c fiber.Ctx, ctx context.Context) error {
	reviewer, err := h.reviewer(c, ctx, false)
	if err != nil {
		return err
	}
	items, err := h.Store.PendingReviews(ctx, reviewer)
	if err != nil {
		return err
	}
	for i := range items {
		if err = h.attachImages(ctx, &items[i], reviewer); err != nil {
			return err
		}
	}
	return c.JSON(fiber.Map{"items": items})
}
func (h *Handler) approve(c fiber.Ctx, ctx context.Context) error {
	reviewer, err := h.reviewer(c, ctx, true)
	if err != nil {
		return err
	}
	if len(c.Body()) != 0 {
		return errInvalid
	}
	item, err := h.Store.Review(ctx, reviewer, c.Params("id"), "approve", "")
	if err != nil {
		return err
	}
	if err = h.attachImages(ctx, &item, reviewer); err != nil {
		return err
	}
	return c.JSON(item)
}
func (h *Handler) reject(c fiber.Ctx, ctx context.Context) error {
	reviewer, err := h.reviewer(c, ctx, true)
	if err != nil {
		return err
	}
	var input struct {
		Reason string `json:"reason"`
	}
	if err = decodeBody(c, &input); err != nil {
		return err
	}
	if strings.TrimSpace(input.Reason) == "" {
		return errInvalid
	}
	item, err := h.Store.Review(ctx, reviewer, c.Params("id"), "reject", input.Reason)
	if err != nil {
		return err
	}
	if err = h.attachImages(ctx, &item, reviewer); err != nil {
		return err
	}
	return c.JSON(item)
}
func (h *Handler) resubmit(c fiber.Ctx, ctx context.Context) error {
	session, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	if len(c.Body()) != 0 {
		return errInvalid
	}
	item, err := h.Store.Resubmit(ctx, session.Member.ID, c.Params("id"))
	if err != nil {
		return err
	}
	if err = h.attachImages(ctx, &item, session.Member.ID); err != nil {
		return err
	}
	return c.JSON(item)
}
func (h *Handler) reviewHistory(c fiber.Ctx, ctx context.Context) error {
	session, err := h.Auth.RequireSession(c, ctx)
	if err != nil {
		return err
	}
	events, err := h.Store.ReviewHistory(ctx, session.Member.ID, c.Params("id"))
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"items": events})
}

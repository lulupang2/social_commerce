package listings

import (
	"context"

	"github.com/gofiber/fiber/v3"
)

func (h *Handler) mySellerStatus(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireSession(c, ctx)
	if err != nil {
		return err
	}
	result, err := h.Store.SellerStatus(ctx, view.Member.ID)
	if err != nil {
		return err
	}
	return c.JSON(result)
}

func (h *Handler) applySeller(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	var input struct {
		Type        string `json:"type"`
		DisplayName string `json:"displayName"`
	}
	if err = decodeBody(c, &input); err != nil {
		return err
	}
	result, err := h.Store.ApplySeller(ctx, view.Member.ID, input.Type, input.DisplayName)
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(result)
}

func (h *Handler) sellerApplications(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireSession(c, ctx)
	if err != nil {
		return err
	}
	result, err := h.Store.PendingSellerApplications(ctx, view.Member.ID)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"items": result})
}

func (h *Handler) reviewSeller(c fiber.Ctx, ctx context.Context, decision string) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	var input struct {
		Reason string `json:"reason"`
	}
	if err = decodeBody(c, &input); err != nil {
		return err
	}
	result, err := h.Store.ReviewSellerApplication(ctx, view.Member.ID, c.Params("id"), decision, input.Reason)
	if err != nil {
		return err
	}
	return c.JSON(result)
}
func (h *Handler) approveSeller(c fiber.Ctx, ctx context.Context) error {
	return h.reviewSeller(c, ctx, "approve")
}
func (h *Handler) rejectSeller(c fiber.Ctx, ctx context.Context) error {
	return h.reviewSeller(c, ctx, "reject")
}

func (h *Handler) ownerInventory(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireSession(c, ctx)
	if err != nil {
		return err
	}
	result, err := h.Store.OwnerInventory(ctx, view.Member.ID, c.Params("id"))
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"inventory": result})
}

func (h *Handler) setInventory(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	var input struct {
		AvailableQuantity *int `json:"availableQuantity"`
	}
	if err = decodeBody(c, &input); err != nil {
		return err
	}
	if input.AvailableQuantity == nil {
		return errInvalid
	}
	result, err := h.Store.SetInventory(ctx, view.Member.ID, c.Params("id"), *input.AvailableQuantity)
	if err != nil {
		return err
	}
	return c.JSON(result)
}

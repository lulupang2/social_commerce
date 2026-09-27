package orders

import (
	"context"

	"github.com/gofiber/fiber/v3"
)

func (h *Handler) listSellerOrders(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireSession(c, ctx)
	if err != nil {
		return err
	}
	items, err := h.Store.ListSellerOrders(ctx, view.Member.ID)
	if err != nil {
		return err
	}
	return c.JSON(ListOrdersResponse{Orders: items})
}

func (h *Handler) advanceOrder(c fiber.Ctx, ctx context.Context, action string) error {
	view, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	var input struct{}
	if err = decodeBody(c, &input); err != nil {
		return err
	}
	order, err := h.Store.AdvanceFulfillment(ctx, c.Params("id"), view.Member.ID, action)
	if err != nil {
		return err
	}
	return c.JSON(order)
}

func (h *Handler) acceptOrder(c fiber.Ctx, ctx context.Context) error {
	return h.advanceOrder(c, ctx, "accept")
}
func (h *Handler) handOverOrder(c fiber.Ctx, ctx context.Context) error {
	return h.advanceOrder(c, ctx, "hand-over")
}
func (h *Handler) receiveOrder(c fiber.Ctx, ctx context.Context) error {
	return h.advanceOrder(c, ctx, "receive")
}
func (h *Handler) fulfillmentHistory(c fiber.Ctx, ctx context.Context) error {
	view, err := h.Auth.RequireSession(c, ctx)
	if err != nil {
		return err
	}
	events, err := h.Store.FulfillmentHistory(ctx, c.Params("id"), view.Member.ID)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"events": events})
}

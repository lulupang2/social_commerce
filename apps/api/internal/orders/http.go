package orders

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

const Prefix = "/api/v1/orders"

// Handler registers order routes and processes requests.
type Handler struct {
	Store     *Store
	PGAdapter PGAdapter
	logger    *slog.Logger
	Auth      *auth.Handler
}

// Register adds order endpoints to the Fiber app and returns the handler.
func Register(app *fiber.App, pool *pgxpool.Pool, authHandler *auth.Handler, pgAdapter PGAdapter, logger *slog.Logger) *Handler {
	h := &Handler{Store: &Store{Pool: pool}, PGAdapter: pgAdapter, logger: logger, Auth: authHandler}
	app.Post(Prefix, h.wrap(h.createOrder))
	app.Get(Prefix, h.wrap(h.listOrders))
	app.Get(Prefix+"/:id", h.wrap(h.getOrder))
	app.Post(Prefix+"/:id/cancel", h.wrap(h.cancelOrder))
	app.Post(Prefix+"/:id/payments/confirm", h.wrap(h.confirmPayment))
	app.Get(Prefix+"/:id/payments/config", h.wrap(h.paymentConfig))
	app.Post(Prefix+"/:id/refunds", h.wrap(h.refund))
	app.Get("/api/v1/seller/orders", h.wrap(h.listSellerOrders))
	app.Post("/api/v1/seller/orders/:id/accept", h.wrap(h.acceptOrder))
	app.Post("/api/v1/seller/orders/:id/hand-over", h.wrap(h.handOverOrder))
	app.Post(Prefix+"/:id/receive", h.wrap(h.receiveOrder))
	app.Get(Prefix+"/:id/fulfillment", h.wrap(h.fulfillmentHistory))
	return h
}

func (h *Handler) paymentConfig(c fiber.Ctx, ctx context.Context) error {
	session, err := h.Auth.RequireSession(c, ctx)
	if err != nil {
		return err
	}
	order, err := h.Store.GetOrder(ctx, c.Params("id"), session.Member.ID)
	if err != nil {
		return err
	}
	if order.BuyerID != session.Member.ID {
		return ErrForbidden
	}
	c.Set("Cache-Control", "no-store")
	if pg, ok := h.PGAdapter.(*TossPG); ok {
		return c.JSON(fiber.Map{"provider": "toss_test", "clientKey": pg.clientKey, "customerKey": order.BuyerID})
	}
	if _, off := h.PGAdapter.(unavailablePG); off {
		return ErrPGUnavailable
	}
	return c.JSON(fiber.Map{"provider": "fake_toss", "clientKey": "", "customerKey": order.BuyerID})
}
func (h *Handler) refund(c fiber.Ctx, ctx context.Context) error {
	session, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	var input struct{}
	if err = decodeBody(c, &input); err != nil {
		return err
	}
	order, err := h.Store.Refund(ctx, h.PGAdapter, c.Params("id"), session.Member.ID)
	if err != nil {
		return err
	}
	if order.PaymentStatus == "pending_cancel" {
		return c.Status(202).JSON(order)
	}
	return c.JSON(order)
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
		status := failure.Status
		if status >= 500 {
			h.logger.Error("order_request_failed", "error_code", failure.Code, "request_id", c.GetRespHeader("X-Request-ID"))
		}
		return c.Status(status).JSON(fiber.Map{
			"code": failure.Code, "message": failure.Message, "requestId": c.GetRespHeader("X-Request-ID"),
		})
	}
	authFailure := auth.PublicFailure(err)
	return c.Status(authFailure.Status).JSON(fiber.Map{
		"code": authFailure.Code, "message": authFailure.Message, "requestId": c.GetRespHeader("X-Request-ID"),
	})
}

func decodeBody(c fiber.Ctx, target any) error {
	if !strings.HasPrefix(strings.ToLower(c.Get("Content-Type")), "application/json") || len(c.Body()) == 0 {
		return ErrInvalid
	}
	decoder := json.NewDecoder(bytes.NewReader(c.Body()))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return ErrInvalid
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return ErrInvalid
	}
	return nil
}

type CreateOrderRequest struct {
	ListingID string `json:"listingId"`
	Quantity  int    `json:"quantity"`
}

type ListOrdersResponse struct {
	Orders []*Order `json:"orders"`
}

func (h *Handler) createOrder(c fiber.Ctx, ctx context.Context) error {
	sessionView, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}

	var input CreateOrderRequest
	if err := decodeBody(c, &input); err != nil {
		return ErrInvalid
	}

	if input.Quantity != 1 {
		return ErrInvalid
	}

	order, err := h.Store.CreateOrder(ctx, sessionView.Member.ID, input.ListingID, input.Quantity)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(order)
}

func (h *Handler) listOrders(c fiber.Ctx, ctx context.Context) error {
	sessionView, err := h.Auth.RequireSession(c, ctx)
	if err != nil {
		return err
	}

	orders, err := h.Store.ListBuyerOrders(ctx, sessionView.Member.ID)
	if err != nil {
		return err
	}

	return c.JSON(ListOrdersResponse{Orders: orders})
}

func (h *Handler) getOrder(c fiber.Ctx, ctx context.Context) error {
	sessionView, err := h.Auth.RequireSession(c, ctx)
	if err != nil {
		return err
	}

	order, err := h.Store.GetOrder(ctx, c.Params("id"), sessionView.Member.ID)
	if err != nil {
		return err
	}

	return c.JSON(order)
}

type CancelOrderResponse struct {
	Order *Order `json:"order"`
}

func (h *Handler) cancelOrder(c fiber.Ctx, ctx context.Context) error {
	sessionView, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}

	order, err := h.Store.CancelOrder(ctx, c.Params("id"), sessionView.Member.ID)
	if err != nil {
		return err
	}

	return c.JSON(CancelOrderResponse{Order: order})
}

func (h *Handler) confirmPayment(c fiber.Ctx, ctx context.Context) error {
	session, err := h.Auth.RequireMutationSession(c, ctx)
	if err != nil {
		return err
	}
	var input ConfirmPaymentRequest
	if err = decodeBody(c, &input); err != nil {
		return err
	}
	order, err := h.Store.ConfirmPayment(ctx, h.PGAdapter, c.Params("id"), session.Member.ID, input)
	if err != nil {
		return err
	}
	if order.PaymentStatus == "pending_approval" {
		return c.Status(202).JSON(order)
	}
	return c.JSON(order)
}

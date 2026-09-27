package orders

import (
	"context"
	"encoding/json"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
	"time"
)

const WebhookPrefix = "/api/v1/payments/toss/webhook"

type WebhookHandler struct {
	store     *Store
	pgAdapter PGAdapter
	logger    *slog.Logger
}

func RegisterWebhook(app *fiber.App, pool *pgxpool.Pool, pg PGAdapter, logger *slog.Logger) *WebhookHandler {
	h := &WebhookHandler{&Store{Pool: pool}, pg, logger}
	app.Post(WebhookPrefix, h.handle)
	return h
}
func (h *WebhookHandler) handle(c fiber.Ctx) error {
	fail := func(status int, code string) error {
		return c.Status(status).JSON(fiber.Map{"code": code, "message": "Payment webhook could not be accepted", "requestId": c.GetRespHeader("X-Request-ID")})
	}
	if _, off := h.pgAdapter.(unavailablePG); off {
		return fail(503, "PAYMENT_UNAVAILABLE")
	}
	var body struct {
		EventType string `json:"eventType"`
		Data      struct {
			OrderID    string `json:"orderId"`
			PaymentKey string `json:"paymentKey"`
			Status     string `json:"status"`
		} `json:"data"`
	}
	if len(c.Body()) == 0 || len(c.Body()) > 65536 || json.Unmarshal(c.Body(), &body) != nil {
		return fail(400, "WEBHOOK_INVALID")
	}
	eventID := c.Get("tosspayments-webhook-transmission-id")
	if len(eventID) == 0 || len(eventID) > 255 || body.EventType != "PAYMENT_STATUS_CHANGED" || !validID(body.Data.OrderID) || !validPaymentKey(h.pgAdapter, body.Data.OrderID, body.Data.PaymentKey) {
		return fail(400, "WEBHOOK_INVALID")
	}
	eventType := ""
	switch body.Data.Status {
	case "DONE":
		eventType = "paymentApproved"
	case "CANCELED", "PARTIAL_CANCELED":
		eventType = "paymentCancelled"
	case "ABORTED", "EXPIRED":
		eventType = "paymentFailed"
	default:
		return fail(400, "WEBHOOK_INVALID")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// This payload is only a hint. No claimed webhook status changes an order.
	// The worker consults the gateway's durable state and validates key + amount.
	// Retain only the hint, never provider card/customer data.
	payload, _ := json.Marshal(map[string]string{"orderId": body.Data.OrderID, "status": body.Data.Status})
	_, err := h.store.Pool.Exec(ctx, `INSERT INTO summergear_app.payment_events(pg_event_id,event_type,raw_payload,order_id,pg_provider)
 VALUES($1,$2,$3::jsonb,$4,$5) ON CONFLICT(pg_provider,pg_event_id) DO NOTHING`, eventID, eventType, string(payload), body.Data.OrderID, gatewayProvider(h.pgAdapter))
	if err != nil {
		return fail(503, "WEBHOOK_STORAGE_UNAVAILABLE")
	}
	// Toss treats an exact 200 response as successful delivery. Other statuses,
	// including a generic asynchronous-acceptance response, are retried.
	return c.Status(200).JSON(fiber.Map{"received": true})
}

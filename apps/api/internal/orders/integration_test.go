//go:build integration

package orders

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
func TestCommerceFixture(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" || os.Getenv("DB_TARGET") != "fixture" || os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("explicit isolated commerce fixture required")
	}
	ctx := context.Background()
	pools := map[platform.Role]*pgxpool.Pool{}
	configs := map[platform.Role]platform.Config{}
	for _, role := range []platform.Role{platform.API, platform.Worker, platform.Migration} {
		cfg, err := platform.LoadConfig(role, "")
		must(t, err)
		p, err := platform.OpenDatabase(ctx, cfg)
		must(t, err)
		pools[role] = p
		configs[role] = cfg
		t.Cleanup(p.Close)
	}
	admin, api, worker := pools[platform.Migration], pools[platform.API], pools[platform.Worker]
	files, err := migrate.LoadFiles("/workspace/supabase/migrations")
	must(t, err)
	logger := platform.NewLogger(io.Discard, "error")
	status, err := migrate.Run(ctx, admin, files, true, logger)
	must(t, err)
	if !status.Ready || status.AppVersion != migrate.PushReceiptsVersion {
		t.Fatal("commerce migration not ready")
	}
	member := func(name string) string {
		var id string
		must(t, admin.QueryRow(ctx, `INSERT INTO summergear_app.members(display_name,onboarded) VALUES($1,true) RETURNING id::text`, name).Scan(&id))
		return id
	}
	buyerA, buyerB, sellerA, sellerB := member("buyer A"), member("buyer B"), member("seller A"), member("seller B")
	seller := func(owner string) string {
		var id string
		must(t, admin.QueryRow(ctx, `INSERT INTO summergear_app.sellers(type,display_name,status) VALUES('individual','Fixture seller','approved') RETURNING id::text`).Scan(&id))
		_, e := admin.Exec(ctx, `INSERT INTO summergear_app.seller_memberships(seller_id,member_id,is_owner) VALUES($1,$2,true)`, id, owner)
		must(t, e)
		return id
	}
	sa, sb := seller(sellerA), seller(sellerB)
	_ = sb
	listing := func() string {
		var id string
		must(t, admin.QueryRow(ctx, `INSERT INTO summergear_app.listings(member_id,sport,category,title,description,price_krw,condition,status,details,location_text,published_at) VALUES($1,'surf','equipment','Commerce board','Isolated commerce test listing',12000,'good','active','{"sport":"surf"}','Fixture',clock_timestamp()) RETURNING id::text`, sellerA).Scan(&id))
		_, e := admin.Exec(ctx, `INSERT INTO summergear_app.inventory_items(listing_id,seller_id,available_quantity) VALUES($1,$2,1)`, id, sa)
		must(t, e)
		return id
	}
	store, workerStore := &Store{Pool: api}, &Store{Pool: worker}
	pg := NewGateway(api, true)
	workerPG := NewGateway(worker, true)
	stock := func(id string, a, r int) {
		t.Helper()
		var gotA, gotR int
		must(t, admin.QueryRow(ctx, `SELECT available_quantity,reserved_quantity FROM summergear_app.inventory_items WHERE listing_id=$1`, id).Scan(&gotA, &gotR))
		if gotA != a || gotR != r {
			t.Fatalf("stock=%d/%d want=%d/%d", gotA, gotR, a, r)
		}
	}
	t.Run("full cancellation is durable and restores stock once", func(t *testing.T) {
		id := listing()
		o, e := store.CreateOrder(ctx, buyerA, id, 1)
		must(t, e)
		o, e = store.ConfirmPayment(ctx, pg, o.ID, buyerA, ConfirmPaymentRequest{PaymentKey: "fake-pay-" + o.ID, Amount: o.TotalAmountKRW})
		must(t, e)
		if o.PaymentStatus != "approved" {
			t.Fatal("not approved")
		}
		if _, e = store.Refund(ctx, pg, o.ID, buyerB); e == nil {
			t.Fatal("other buyer refunded order")
		}
		for range 2 {
			o, e = store.Refund(ctx, pg, o.ID, buyerA)
			must(t, e)
			if o.PaymentStatus != "cancelled" {
				t.Fatal("refund not completed")
			}
		}
		stock(id, 1, 0)
		must(t, workerStore.ApplyPayment(ctx, "", o.ID, &PaymentState{OrderID: o.ID, PaymentKey: "fake-pay-" + o.ID, Amount: o.TotalAmountKRW, Status: "approved"}))
		final, e := store.GetOrder(ctx, o.ID, buyerA)
		must(t, e)
		if final.PaymentStatus != "cancelled" {
			t.Fatal("late approval regressed refund")
		}
		if e = workerStore.ApplyPayment(ctx, "", o.ID, &PaymentState{Provider: "toss_test", OrderID: o.ID, PaymentKey: "fake-pay-" + o.ID, Amount: o.TotalAmountKRW, Status: "cancelled"}); e == nil {
			t.Fatal("cross-provider result accepted")
		}
	})
	t.Run("test logins have independent buyers with Toss enabled", func(t *testing.T) {
		cfg, e := auth.ParseConfig(func(k string) string {
			if k == "PUBLIC_WEB_URL" {
				return "https://app.example.invalid"
			}
			if k == "AUTH_DEV_LOGIN_ENABLED" {
				return "true"
			}
			return ""
		}, platform.Config{Target: "fixture", TossSecretKey: "test_gsk_fixture"})
		must(t, e)
		authStore := &auth.Store{Pool: api, Config: cfg}
		_, a, e := authStore.DevLogin(ctx, "", "")
		must(t, e)
		_, b, e := authStore.DevLogin(ctx, "", "")
		must(t, e)
		if a.Member.ID == b.Member.ID {
			t.Fatal("shared test buyer")
		}
		oldStore := &auth.Store{Pool: api, Config: auth.Config{IdleTTL: cfg.IdleTTL, AbsoluteTTL: cfg.AbsoluteTTL}}
		oldToken, _, e := oldStore.DevLogin(ctx, "", "")
		must(t, e)
		if _, e = authStore.Session(ctx, oldToken); e == nil {
			t.Fatal("shared legacy session accepted with Toss")
		}
	})
	t.Run("lost full cancellation response reconciles without releasing stock twice", func(t *testing.T) {
		id := listing()
		o, e := store.CreateOrder(ctx, buyerA, id, 1)
		must(t, e)
		o, e = store.ConfirmPayment(ctx, pg, o.ID, buyerA, ConfirmPaymentRequest{PaymentKey: "fake-pay-" + o.ID, Amount: o.TotalAmountKRW})
		must(t, e)
		o, e = store.Refund(ctx, lostCancelPG{pg}, o.ID, buyerA)
		must(t, e)
		if o.PaymentStatus != "pending_cancel" {
			t.Fatal("lost cancel response finalized")
		}
		stock(id, 0, 0)
		must(t, workerStore.ReconcilePayments(ctx, workerPG))
		must(t, workerStore.ReconcilePayments(ctx, workerPG))
		o, e = store.GetOrder(ctx, o.ID, buyerA)
		must(t, e)
		if o.PaymentStatus != "cancelled" {
			t.Fatal("cancel not reconciled")
		}
		stock(id, 1, 0)
	})

	t.Run("ownership cancellation and replay", func(t *testing.T) {
		id := listing()
		if _, e := store.CreateOrder(ctx, sellerA, id, 1); !errors.Is(e, ErrSelfPurchase) {
			t.Fatal("self purchase accepted", e)
		}
		if _, e := store.CreateOrder(ctx, buyerA, id, 2); !errors.Is(e, ErrInvalid) {
			t.Fatal("quantity 2 accepted")
		}
		o, e := store.CreateOrder(ctx, buyerA, id, 1)
		must(t, e)
		stock(id, 0, 1)
		repeated, e := store.CreateOrder(ctx, buyerA, id, 1)
		must(t, e)
		if repeated.ID != o.ID {
			t.Fatal("create replay duplicated order")
		}
		for _, m := range []string{buyerB, sellerB} {
			if _, e = store.GetOrder(ctx, o.ID, m); !errors.Is(e, ErrNotFound) {
				t.Fatal("unrelated member read order", e)
			}
			if _, e = store.CancelOrder(ctx, o.ID, m); !errors.Is(e, ErrNotFound) {
				t.Fatal("unrelated member cancelled order", e)
			}
		}
		_, e = store.GetOrder(ctx, o.ID, sellerA)
		must(t, e)
		orders, e := store.ListBuyerOrders(ctx, buyerB)
		must(t, e)
		if len(orders) != 0 {
			t.Fatal("buyer B saw other orders")
		}
		_, e = store.CancelOrder(ctx, o.ID, buyerA)
		must(t, e)
		_, e = store.CancelOrder(ctx, o.ID, buyerA)
		must(t, e)
		stock(id, 1, 0)
		var leaked string
		must(t, api.QueryRow(ctx, `SELECT COALESCE(current_setting('summergear.member_id',true),'')`).Scan(&leaked))
		if leaked != "" {
			t.Fatal("member context leaked")
		}
	})
	t.Run("last inventory concurrent buyers", func(t *testing.T) {
		id := listing()
		var wg sync.WaitGroup
		out := make(chan error, 2)
		for _, buyer := range []string{buyerA, buyerB} {
			wg.Add(1)
			go func(b string) { defer wg.Done(); _, e := store.CreateOrder(ctx, b, id, 1); out <- e }(buyer)
		}
		wg.Wait()
		close(out)
		success := 0
		for e := range out {
			if e == nil {
				success++
			} else if !errors.Is(e, ErrInsufficientStock) {
				t.Fatal(e)
			}
		}
		if success != 1 {
			t.Fatal("oversold", success)
		}
		stock(id, 0, 1)
	})
	t.Run("expiry is idempotent", func(t *testing.T) {
		id := listing()
		o, e := store.CreateOrder(ctx, buyerA, id, 1)
		must(t, e)
		_, e = admin.Exec(ctx, `UPDATE summergear_app.inventory_reservations SET expires_at=clock_timestamp()-interval '1 minute' WHERE order_id=$1`, o.ID)
		must(t, e)
		must(t, workerStore.ExpireReservations(ctx))
		must(t, workerStore.ExpireReservations(ctx))
		stock(id, 1, 0)
		_, e = store.ConfirmPayment(ctx, pg, o.ID, buyerA, ConfirmPaymentRequest{"fake-pay-" + o.ID, 12000})
		if !errors.Is(e, ErrConflict) {
			t.Fatal("expired order approved", e)
		}
	})
	t.Run("approval amount and duplicate consumption", func(t *testing.T) {
		id := listing()
		o, e := store.CreateOrder(ctx, buyerA, id, 1)
		must(t, e)
		_, e = store.ConfirmPayment(ctx, pg, o.ID, buyerA, ConfirmPaymentRequest{"fake-pay-" + o.ID, 1})
		if !errors.Is(e, ErrInvalid) {
			t.Fatal("amount tampering accepted", e)
		}
		_, e = store.ConfirmPayment(ctx, pg, o.ID, sellerA, ConfirmPaymentRequest{"fake-pay-" + o.ID, 12000})
		if !errors.Is(e, ErrForbidden) {
			t.Fatal("seller approved buyer payment", e)
		}
		paid, e := store.ConfirmPayment(ctx, pg, o.ID, buyerA, ConfirmPaymentRequest{"fake-pay-" + o.ID, 12000})
		must(t, e)
		if paid.Status != "confirmed" {
			t.Fatal("approval not finalized")
		}
		_, e = store.ConfirmPayment(ctx, pg, o.ID, buyerA, ConfirmPaymentRequest{"fake-pay-" + o.ID, 12000})
		must(t, e)
		must(t, workerStore.ExpireReservations(ctx))
		stock(id, 0, 0)
		_, e = store.CancelOrder(ctx, o.ID, buyerA)
		if !errors.Is(e, ErrConflict) {
			t.Fatal("paid order cancelled without refund")
		}
	})
	t.Run("seller handover and buyer receipt are independent of payment", func(t *testing.T) {
		id := listing()
		o, e := store.CreateOrder(ctx, buyerA, id, 1)
		must(t, e)
		if _, e = store.AdvanceFulfillment(ctx, o.ID, sellerA, "accept"); !errors.Is(e, ErrConflict) {
			t.Fatal("unpaid order accepted", e)
		}
		o, e = store.ConfirmPayment(ctx, pg, o.ID, buyerA, ConfirmPaymentRequest{"fake-pay-" + o.ID, 12000})
		must(t, e)
		if o.FulfillmentStatus != "awaiting_acceptance" || o.ReceivedAt != nil {
			t.Fatal("payment implied receipt")
		}
		sellerOrders, e := store.ListSellerOrders(ctx, sellerA)
		must(t, e)
		found := false
		for _, item := range sellerOrders {
			found = found || item.ID == o.ID
		}
		if !found {
			t.Fatal("seller cannot find own order")
		}
		sellerOrders, e = store.ListSellerOrders(ctx, sellerB)
		must(t, e)
		for _, item := range sellerOrders {
			if item.ID == o.ID {
				t.Fatal("other seller saw order")
			}
		}
		if _, e = store.AdvanceFulfillment(ctx, o.ID, sellerB, "accept"); !errors.Is(e, ErrNotFound) {
			t.Fatal("other seller accepted", e)
		}
		if _, e = store.AdvanceFulfillment(ctx, o.ID, buyerA, "accept"); !errors.Is(e, ErrNotFound) {
			t.Fatal("buyer accepted as seller", e)
		}
		o, e = store.AdvanceFulfillment(ctx, o.ID, sellerA, "accept")
		must(t, e)
		if o.FulfillmentStatus != "accepted" || o.AcceptedAt == nil {
			t.Fatal("seller acceptance missing")
		}
		if _, e = store.AdvanceFulfillment(ctx, o.ID, buyerA, "receive"); !errors.Is(e, ErrConflict) {
			t.Fatal("buyer received before handover", e)
		}
		o, e = store.AdvanceFulfillment(ctx, o.ID, sellerA, "hand-over")
		must(t, e)
		if o.HandedOverAt == nil || o.FulfillmentStatus != "handed_over" {
			t.Fatal("handover missing")
		}
		if _, e = store.Refund(ctx, pg, o.ID, buyerA); !errors.Is(e, ErrConflict) {
			t.Fatal("refund after handover allowed", e)
		}
		if _, e = store.AdvanceFulfillment(ctx, o.ID, sellerA, "receive"); !errors.Is(e, ErrNotFound) {
			t.Fatal("seller confirmed receipt", e)
		}
		o, e = store.AdvanceFulfillment(ctx, o.ID, buyerA, "receive")
		must(t, e)
		if o.FulfillmentStatus != "completed" || o.ReceivedAt == nil || o.PaymentStatus != "approved" {
			t.Fatal("receipt did not complete trade")
		}
		events, e := store.FulfillmentHistory(ctx, o.ID, buyerA)
		must(t, e)
		if len(events) != 3 || events[0].ActorMemberID != sellerA || events[2].ActorMemberID != buyerA {
			t.Fatal("fulfillment audit incorrect", events)
		}
		stock(id, 0, 0)
	})
	t.Run("buyer refund and seller handover serialize", func(t *testing.T) {
		id := listing()
		o, e := store.CreateOrder(ctx, buyerA, id, 1)
		must(t, e)
		o, e = store.ConfirmPayment(ctx, pg, o.ID, buyerA, ConfirmPaymentRequest{"fake-pay-" + o.ID, 12000})
		must(t, e)
		_, e = store.AdvanceFulfillment(ctx, o.ID, sellerA, "accept")
		must(t, e)
		type result struct {
			action string
			err    error
		}
		out := make(chan result, 2)
		go func() { _, e := store.Refund(ctx, pg, o.ID, buyerA); out <- result{"refund", e} }()
		go func() {
			_, e := store.AdvanceFulfillment(ctx, o.ID, sellerA, "hand-over")
			out <- result{"hand-over", e}
		}()
		a, b := <-out, <-out
		if (a.err == nil) == (b.err == nil) {
			t.Fatal("both conflicting transitions succeeded or failed", a, b)
		}
		final, e := store.GetOrder(ctx, o.ID, buyerA)
		must(t, e)
		if final.FulfillmentStatus == "handed_over" {
			if final.PaymentStatus != "approved" {
				t.Fatal("cancelled after handover")
			}
			stock(id, 0, 0)
		} else if final.PaymentStatus == "cancelled" {
			stock(id, 1, 0)
		} else {
			t.Fatal("unexpected race result", final.FulfillmentStatus, final.PaymentStatus)
		}
	})
	t.Run("lost PG response survives restart and expiry", func(t *testing.T) {
		id := listing()
		o, e := store.CreateOrder(ctx, buyerA, id, 1)
		must(t, e)
		unknown, e := store.ConfirmPayment(ctx, lostResponsePG{pg}, o.ID, buyerA, ConfirmPaymentRequest{"fake-pay-" + o.ID, 12000})
		must(t, e)
		if unknown.PaymentStatus != "pending_approval" {
			t.Fatal("lost response incorrectly finalized")
		}
		_, e = admin.Exec(ctx, `UPDATE summergear_app.inventory_reservations SET expires_at=clock_timestamp()-interval '1 minute' WHERE order_id=$1`, o.ID)
		must(t, e)
		must(t, workerStore.ExpireReservations(ctx))
		stock(id, 0, 1)
		must(t, workerStore.ReconcilePayments(ctx, workerPG))
		must(t, workerStore.ReconcilePayments(ctx, workerPG))
		stock(id, 0, 0)
		restored, e := store.GetOrder(ctx, o.ID, buyerA)
		must(t, e)
		if restored.Status != "confirmed" {
			t.Fatal("payment not restored")
		}
	})
	t.Run("HTTP sessions CSRF and webhook", func(t *testing.T) {
		values := map[string]string{"APP_ENV": "test", "PUBLIC_WEB_URL": "https://commerce.example.invalid"}
		cfg, e := auth.ParseConfig(func(k string) string { return values[k] }, configs[platform.API])
		must(t, e)
		app := fiber.New()
		ah := auth.Register(app, cfg, api, logger)
		Register(app, api, ah, pg, logger)
		RegisterWebhook(app, api, pg, logger)
		session := func(m string) (string, string) {
			b := make([]byte, 32)
			_, e := rand.Read(b)
			must(t, e)
			token := base64.RawURLEncoding.EncodeToString(b)
			hash := sha256.Sum256([]byte(token))
			_, e = admin.Exec(ctx, `INSERT INTO summergear_app.auth_sessions(token_hash,member_id,last_seen_at,idle_expires_at,absolute_expires_at) VALUES($1,$2,clock_timestamp(),clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '1 day')`, hex.EncodeToString(hash[:]), m)
			must(t, e)
			view, e := (&auth.Store{Pool: api, Config: cfg}).Session(ctx, token)
			must(t, e)
			return token, view.CSRFToken
		}
		token, csrf := session(buyerA)
		tokenB, _ := session(buyerB)
		request := func(method, path, body, token, csrf string) (int, []byte) {
			r := httptest.NewRequest(method, cfg.PublicURL+path, strings.NewReader(body))
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("Origin", cfg.PublicURL)
			r.Header.Set("X-CSRF-Token", csrf)
			if token != "" {
				r.AddCookie(&http.Cookie{Name: cfg.SessionCookie(), Value: token})
			}
			resp, e := app.Test(r)
			must(t, e)
			defer resp.Body.Close()
			data, e := io.ReadAll(resp.Body)
			must(t, e)
			return resp.StatusCode, data
		}
		webhook := func(transmissionID, body string) (int, []byte) {
			r := httptest.NewRequest("POST", cfg.PublicURL+WebhookPrefix, strings.NewReader(body))
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("tosspayments-webhook-transmission-id", transmissionID)
			resp, e := app.Test(r)
			must(t, e)
			defer resp.Body.Close()
			data, e := io.ReadAll(resp.Body)
			must(t, e)
			return resp.StatusCode, data
		}
		id := listing()
		body := `{"listingId":"` + id + `","quantity":1}`
		code, _ := request("GET", Prefix, "", "", "")
		if code != 401 {
			t.Fatal("anonymous status", code)
		}
		code, _ = request("POST", Prefix, body, token, "")
		if code != 403 {
			t.Fatal("CSRF status", code)
		}
		code, data := request("POST", Prefix, body, token, csrf)
		if code != 201 {
			t.Fatalf("create HTTP %d %s", code, data)
		}
		var o Order
		must(t, json.Unmarshal(data, &o))
		code, _ = request("GET", Prefix+"/"+o.ID, "", tokenB, "")
		if code != 404 {
			t.Fatal("buyer B HTTP access", code)
		}
		key := "fake-pay-" + o.ID
		forged := `{"eventType":"PAYMENT_STATUS_CHANGED","data":{"orderId":"` + o.ID + `","paymentKey":"` + key + `","status":"DONE"}}`
		for i := 0; i < 2; i++ {
			code, _ = webhook("fixture-forged", forged)
			if code != 200 {
				t.Fatal("webhook status", code)
			}
		}
		must(t, workerStore.ReconcileEvents(ctx, workerPG))
		unchanged, e := store.GetOrder(ctx, o.ID, buyerA)
		must(t, e)
		if unchanged.PaymentStatus != "unpaid" {
			t.Fatal("forged webhook approved payment")
		}
		var count int
		must(t, admin.QueryRow(ctx, `SELECT count(*) FROM summergear_app.payment_events WHERE order_id=$1`, o.ID).Scan(&count))
		if count != 1 {
			t.Fatal("webhook not deduplicated")
		}
		code, data = request("POST", Prefix+"/"+o.ID+"/payments/confirm", `{"paymentKey":"`+key+`","amount":12000}`, token, csrf)
		if code != 200 {
			t.Fatalf("HTTP approve %d %s", code, data)
		}
		for i := 0; i < 2; i++ {
			code, _ = webhook("fixture-approved", forged)
			if code != 200 {
				t.Fatal("known webhook status", code)
			}
		}
		must(t, workerStore.ReconcileEvents(ctx, workerPG))
		var verified bool
		must(t, admin.QueryRow(ctx, `SELECT verified_with_pg FROM summergear_app.payment_events WHERE order_id=$1`, o.ID).Scan(&verified))
		if !verified {
			t.Fatal("known event not verified")
		}
		must(t, func() error { _, err := pg.Cancel(ctx, buyerA, key); return err }())
		cancelled := `{"eventType":"PAYMENT_STATUS_CHANGED","data":{"orderId":"` + o.ID + `","paymentKey":"` + key + `","status":"CANCELED"}}`
		code, _ = webhook("fixture-cancelled", cancelled)
		if code != 200 {
			t.Fatal("cancelled webhook status", code)
		}
		// A stale approval hint arriving after the cancellation must not roll the
		// order back because both events are reconciled against current PG state.
		code, _ = webhook("fixture-stale-approved", forged)
		if code != 200 {
			t.Fatal("stale webhook status", code)
		}
		must(t, workerStore.ReconcileEvents(ctx, workerPG))
		final, e := store.GetOrder(ctx, o.ID, buyerA)
		must(t, e)
		if final.Status != "cancelled" || final.PaymentStatus != "cancelled" {
			t.Fatal("reverse webhook order changed authoritative cancellation", final.Status, final.PaymentStatus)
		}
		stock(id, 1, 0)
		var refundStatus string
		var refundAmount, remaining int64
		must(t, admin.QueryRow(ctx, `SELECT status::text,refund_amount,remaining_cancellable FROM summergear_app.refunds WHERE order_id=$1`, o.ID).Scan(&refundStatus, &refundAmount, &remaining))
		if refundStatus != "completed" || refundAmount != 12000 || remaining != 0 {
			t.Fatal("provider cancellation refund ledger mismatch", refundStatus, refundAmount, remaining)
		}
		must(t, admin.QueryRow(ctx, `SELECT count(*) FROM summergear_app.payment_events WHERE order_id=$1 AND state='processed' AND verified_with_pg`, o.ID).Scan(&count))
		if count != 4 {
			t.Fatal("duplicate or reverse webhooks not reconciled", count)
		}
	})
}

type lostResponsePG struct{ PGAdapter }

type lostCancelPG struct{ PGAdapter }

func (p lostCancelPG) Cancel(ctx context.Context, member, key string) (*PaymentState, error) {
	_, err := p.PGAdapter.Cancel(ctx, member, key)
	if err != nil {
		return nil, err
	}
	return nil, ErrPGUnknown
}

func (p lostResponsePG) Approve(ctx context.Context, m, o string, a int64, k string) (*PaymentState, error) {
	_, err := p.PGAdapter.Approve(ctx, m, o, a, k)
	if err != nil {
		return nil, err
	}
	return nil, ErrPGUnknown
}

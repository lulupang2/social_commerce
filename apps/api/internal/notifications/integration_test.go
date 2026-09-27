//go:build integration

package notifications

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
	"github.com/lulupang2/social_commerce/apps/api/internal/httpapi"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

type testSender struct {
	mu           sync.Mutex
	calls        []string
	tickets      map[string]string // token -> ticket id
	receipts     map[string]Receipt
	expired      bool
	failure      bool
	failTokens   map[string]bool
	receiptErr   error
	receiptCalls int
}

func (s *testSender) Send(_ context.Context, token, title, body, route string) (Ticket, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, token+":"+route)
	if s.failure || s.failTokens[token] {
		return Ticket{}, errors.New("fixture provider failure")
	}
	if s.expired {
		return Ticket{Expired: true}, nil
	}
	id := s.tickets[token]
	if id == "" {
		id = "ticket-" + token
	}
	return Ticket{ID: id}, nil
}

func (s *testSender) GetReceipts(_ context.Context, ids []string) (map[string]Receipt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.receiptCalls++
	if s.receiptErr != nil {
		return nil, s.receiptErr
	}
	result := make(map[string]Receipt, len(ids))
	for _, id := range ids {
		if r, ok := s.receipts[id]; ok {
			result[id] = r
		}
	}
	return result, nil
}

func (s *testSender) Count() int { s.mu.Lock(); defer s.mu.Unlock(); return len(s.calls) }
func (s *testSender) ReceiptCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.receiptCalls
}
func (s *testSender) CallsFor(token string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	var count int
	for _, call := range s.calls {
		if strings.HasPrefix(call, token+":") {
			count++
		}
	}
	return count
}

func require(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func hashToken(v string) string { s := sha256.Sum256([]byte(v)); return hex.EncodeToString(s[:]) }

func TestPushSessionScopeOutboxAndDelivery(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" || os.Getenv("DB_TARGET") != "fixture" || os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("disposable fixture required")
	}
	ctx := context.Background()
	pools := map[platform.Role]*pgxpool.Pool{}
	var cfg platform.Config
	for _, role := range []platform.Role{platform.Migration, platform.API, platform.Worker} {
		var err error
		cfg, err = platform.LoadConfig(role, "")
		require(t, err)
		pool, err := platform.OpenDatabase(ctx, cfg)
		require(t, err)
		pools[role] = pool
		t.Cleanup(pool.Close)
	}
	admin, api, worker := pools[platform.Migration], pools[platform.API], pools[platform.Worker]
	files, err := migrate.LoadFiles("/workspace/supabase/migrations")
	require(t, err)
	logger := platform.NewLogger(io.Discard, "error")
	status, err := migrate.Run(ctx, admin, files, true, logger)
	require(t, err)
	if !status.Ready || status.AppVersion != migrate.PushReceiptsVersion {
		t.Fatal("push receipt schema not ready")
	}
	apiCfg, err := platform.LoadConfig(platform.API, "")
	require(t, err)
	ac, err := auth.ParseConfig(func(key string) string {
		switch key {
		case "APP_ENV":
			return "test"
		case "PUBLIC_WEB_URL":
			return "https://app.example.invalid"
		case "AUTH_DEV_LOGIN_ENABLED":
			return "true"
		}
		return ""
	}, apiCfg)
	require(t, err)
	store := &auth.Store{Pool: api, Config: ac}
	token, view, err := store.DevLogin(ctx, "", "seller_a")
	require(t, err)
	app := httpapi.New(logger, nil).App
	authHandler := auth.Register(app, ac, api, logger)
	Register(app, api, authHandler, logger)
	t.Cleanup(func() { _ = app.Shutdown() })
	request := func(method, body string, csrf bool) (int, []byte) {
		t.Helper()
		req := httptest.NewRequest(method, ac.PublicURL+"/api/v1/me/push-devices", bytes.NewBufferString(body))
		req.Header.Set("Origin", ac.PublicURL)
		req.Header.Set("Content-Type", "application/json")
		if csrf {
			req.Header.Set("X-CSRF-Token", view.CSRFToken)
		}
		req.AddCookie(&http.Cookie{Name: ac.SessionCookie(), Value: token})
		resp, e := app.Test(req, fiber.TestConfig{Timeout: 20 * time.Second})
		require(t, e)
		data, e := io.ReadAll(resp.Body)
		resp.Body.Close()
		require(t, e)
		return resp.StatusCode, data
	}
	pushToken := "ExpoPushToken[abcdefghijklmnopqrstuvwxyz123456]"
	body := `{"token":"` + pushToken + `","platform":"android"}`
	if code, _ := request("POST", body, false); code != 403 {
		t.Fatalf("push registered without CSRF: %d", code)
	}
	if code, data := request("POST", body, true); code != 200 {
		t.Fatalf("push registration: %d %s", code, data)
	}
	if code, data := request("POST", body, true); code != 200 {
		t.Fatalf("push replay: %d %s", code, data)
	}
	var devices int
	require(t, admin.QueryRow(ctx, `SELECT count(*) FROM summergear_app.push_devices WHERE member_id=$1 AND active`, view.Member.ID).Scan(&devices))
	if devices != 1 {
		t.Fatalf("duplicate device: %d", devices)
	}
	var hash string
	require(t, admin.QueryRow(ctx, `SELECT session_hash FROM summergear_app.push_devices WHERE token=$1`, pushToken).Scan(&hash))
	if hash == token {
		t.Fatal("raw session token stored")
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), `DELETE FROM summergear_app.notification_deliveries WHERE device_id IN (SELECT id FROM summergear_app.push_devices WHERE token=$1)`, pushToken)
		_, _ = admin.Exec(context.Background(), `DELETE FROM summergear_app.notification_events WHERE member_id=(SELECT member_id FROM summergear_app.push_devices WHERE token=$1)`, pushToken)
		_, _ = admin.Exec(context.Background(), `DELETE FROM summergear_app.push_devices WHERE token=$1`, pushToken)
		_, _ = admin.Exec(context.Background(), `DELETE FROM summergear_app.auth_sessions WHERE token_hash=$1`, hash)
	})
	eventIDs := []string{}
	create := func() string {
		t.Helper()
		var id string
		require(t, admin.QueryRow(ctx, `INSERT INTO summergear_app.notification_events(event_key,member_id,actor_member_id,kind,resource_id,next_attempt_at)
 VALUES($1,$2,$2,'chat_message',$3,clock_timestamp()) RETURNING id::text`, uuid.NewString(), view.Member.ID, uuid.NewString()).Scan(&id))
		eventIDs = append(eventIDs, id)
		return id
	}
	t.Cleanup(func() {
		for _, id := range eventIDs {
			_, _ = admin.Exec(context.Background(), `DELETE FROM summergear_app.notification_deliveries WHERE event_id=$1`, id)
			_, _ = admin.Exec(context.Background(), `DELETE FROM summergear_app.notification_events WHERE id=$1`, id)
		}
	})
	var eventID = create()
	sender := &testSender{tickets: map[string]string{pushToken: "ticket-1"}, receipts: map[string]Receipt{"ticket-1": {Status: "ok"}}}
	dispatcher := &DispatchWorker{Pool: worker, Sender: sender}
	reconciler := &ReconcileWorker{Pool: worker, Sender: sender}
	readyReceipt := func(id string) {
		t.Helper()
		_, err := admin.Exec(ctx, `UPDATE summergear_app.notification_deliveries
 SET ticket_received_at=clock_timestamp()-interval '16 minutes' WHERE event_id=$1 AND ticket_id IS NOT NULL`, id)
		require(t, err)
		_, err = admin.Exec(ctx, `UPDATE summergear_app.notification_events SET next_attempt_at=clock_timestamp() WHERE id=$1`, id)
		require(t, err)
	}
	require(t, dispatcher.Dispatch(ctx))
	var delivered string
	require(t, admin.QueryRow(ctx, `SELECT status FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&delivered))
	if delivered != "receipt_pending" {
		t.Fatalf("expected receipt_pending after dispatch, got %s", delivered)
	}
	require(t, reconciler.Reconcile(ctx))
	require(t, admin.QueryRow(ctx, `SELECT status FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&delivered))
	if delivered != "receipt_pending" {
		t.Fatal("receipt must not be queried before its minimum age")
	}
	readyReceipt(eventID)
	require(t, reconciler.Reconcile(ctx))
	require(t, admin.QueryRow(ctx, `SELECT status FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&delivered))
	if delivered != "sent" {
		t.Fatalf("expected sent after receipt ok, got %s", delivered)
	}
	count := sender.Count()
	require(t, dispatcher.Dispatch(ctx))
	require(t, reconciler.Reconcile(ctx))
	if sender.Count() != count || deliveredCount(t, admin, eventID) != 1 {
		t.Fatal("delivered event sent again")
	}
	if code, _ := request("DELETE", body, true); code != 204 {
		t.Fatalf("device unregister: %d", code)
	}
	eventID = create()
	require(t, dispatcher.Dispatch(ctx))
	require(t, admin.QueryRow(ctx, `SELECT status FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&delivered))
	if delivered != "skipped" || deliveredCount(t, admin, eventID) != 0 {
		t.Fatal("unregistered device received notification")
	}
	if code, _ := request("POST", body, true); code != 200 {
		t.Fatalf("device re-register: %d", code)
	}
	// Receipt reports the device as no longer registered.
	sender.expired = false
	sender.receipts = map[string]Receipt{"ticket-1": {Status: "error", Details: "DeviceNotRegistered"}}
	eventID = create()
	require(t, dispatcher.Dispatch(ctx))
	readyReceipt(eventID)
	_, err = admin.Exec(ctx, `UPDATE summergear_app.push_devices SET updated_at=clock_timestamp()-interval '17 minutes' WHERE token=$1`, pushToken)
	require(t, err)
	require(t, reconciler.Reconcile(ctx))
	require(t, admin.QueryRow(ctx, `SELECT count(*) FROM summergear_app.push_devices WHERE token=$1 AND active`, pushToken).Scan(&devices))
	if devices != 0 {
		t.Fatal("expired token was not disabled")
	}
	require(t, admin.QueryRow(ctx, `SELECT status FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&delivered))
	if delivered != "failed" {
		t.Fatalf("expected failed after DeviceNotRegistered receipt, got %s", delivered)
	}
	if code, _ := request("POST", body, true); code != 200 {
		t.Fatalf("device re-register after expiry: %d", code)
	}
	// A late receipt must not disable a device re-registered after its ticket.
	eventID = create()
	require(t, dispatcher.Dispatch(ctx))
	readyReceipt(eventID)
	if code, _ := request("POST", body, true); code != 200 {
		t.Fatalf("device re-register before old receipt: %d", code)
	}
	require(t, reconciler.Reconcile(ctx))
	require(t, admin.QueryRow(ctx, `SELECT count(*) FROM summergear_app.push_devices WHERE token=$1 AND active`, pushToken).Scan(&devices))
	if devices != 1 {
		t.Fatal("stale unregistered receipt disabled the re-registered device")
	}
	sender.receipts = map[string]Receipt{"ticket-1": {Status: "ok"}}
	// Provider failure during dispatch is retried without re-sending a ticket already accepted.
	sender.expired = false
	sender.failure = true
	eventID = create()
	require(t, dispatcher.Dispatch(ctx))
	var attempts int
	require(t, admin.QueryRow(ctx, `SELECT status,attempts FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&delivered, &attempts))
	if delivered != "pending" || attempts != 1 {
		t.Fatal("provider failure was not retained for retry")
	}
	sender.failure = false
	_, err = admin.Exec(ctx, `UPDATE summergear_app.notification_events SET next_attempt_at=clock_timestamp() WHERE id=$1`, eventID)
	require(t, err)
	require(t, dispatcher.Dispatch(ctx))
	require(t, admin.QueryRow(ctx, `SELECT status FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&delivered))
	if delivered != "receipt_pending" {
		t.Fatalf("durable retry did not dispatch: %s", delivered)
	}
	readyReceipt(eventID)
	require(t, reconciler.Reconcile(ctx))
	require(t, admin.QueryRow(ctx, `SELECT status FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&delivered))
	if delivered != "sent" {
		t.Fatalf("durable retry did not deliver: %s", delivered)
	}
	// A partial send retries only the device without a ticket; accepted tickets
	// remain durable, and a permanently failed device prevents aggregate success.
	secondToken := "ExpoPushToken[bcdefghijklmnopqrstuvwxyz1234567]"
	secondBody := `{"token":"` + secondToken + `","platform":"android"}`
	if code, _ := request("POST", secondBody, true); code != 200 {
		t.Fatalf("second device registration: %d", code)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), `DELETE FROM summergear_app.push_devices WHERE token=$1`, secondToken)
	})
	sender.tickets[secondToken] = "ticket-2"
	sender.receipts["ticket-2"] = Receipt{Status: "ok"}
	sender.failTokens = map[string]bool{secondToken: true}
	firstCalls := sender.CallsFor(pushToken)
	eventID = create()
	require(t, dispatcher.Dispatch(ctx))
	require(t, admin.QueryRow(ctx, `SELECT status FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&delivered))
	if delivered != "pending" || deliveredCount(t, admin, eventID) != 1 {
		t.Fatal("partial send lost the remaining-device retry or the accepted ticket")
	}
	delete(sender.failTokens, secondToken)
	_, err = admin.Exec(ctx, `UPDATE summergear_app.notification_events SET next_attempt_at=clock_timestamp() WHERE id=$1`, eventID)
	require(t, err)
	require(t, dispatcher.Dispatch(ctx))
	if sender.CallsFor(pushToken) != firstCalls+1 || sender.CallsFor(secondToken) != 2 || deliveredCount(t, admin, eventID) != 2 {
		t.Fatal("retry resent an accepted ticket or skipped the unsent device")
	}
	readyReceipt(eventID)
	require(t, reconciler.Reconcile(ctx))
	require(t, admin.QueryRow(ctx, `SELECT status FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&delivered))
	if delivered != "sent" {
		t.Fatalf("both receipt successes must complete the event: %s", delivered)
	}
	sender.failTokens[secondToken] = true
	eventID = create()
	firstCalls = sender.CallsFor(pushToken)
	require(t, dispatcher.Dispatch(ctx))
	for range 4 {
		_, err = admin.Exec(ctx, `UPDATE summergear_app.notification_events SET next_attempt_at=clock_timestamp() WHERE id=$1`, eventID)
		require(t, err)
		require(t, dispatcher.Dispatch(ctx))
	}
	if sender.CallsFor(pushToken) != firstCalls+1 || deliveredCount(t, admin, eventID) != 2 {
		t.Fatal("bounded partial failure must retain both successful and failed device outcomes")
	}
	readyReceipt(eventID)
	require(t, reconciler.Reconcile(ctx))
	var lastError string
	require(t, admin.QueryRow(ctx, `SELECT status,last_error_code FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&delivered, &lastError))
	if delivered != "failed" || lastError != "expo_delivery_failed" {
		t.Fatalf("partial failure cannot be reported as sent: %s %s", delivered, lastError)
	}
	// Logout invalidates any registered token without relying on a browser cleanup.
	require(t, store.Logout(ctx, token, false))
	eventID = create()
	count = sender.Count()
	require(t, dispatcher.Dispatch(ctx))
	require(t, admin.QueryRow(ctx, `SELECT status FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&delivered))
	if delivered != "skipped" || sender.Count() != count || deliveredCount(t, admin, eventID) != 0 {
		t.Fatal("revoked session received push")
	}
}

func deliveredCount(t *testing.T, admin *pgxpool.Pool, eventID string) int {
	t.Helper()
	var count int
	require(t, admin.QueryRow(context.Background(), `SELECT count(*) FROM summergear_app.notification_deliveries WHERE event_id=$1`, eventID).Scan(&count))
	return count
}

func TestPushReceiptOmittedAndTimeout(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" || os.Getenv("DB_TARGET") != "fixture" || os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("disposable fixture required")
	}
	ctx := context.Background()
	pools := map[platform.Role]*pgxpool.Pool{}
	for _, role := range []platform.Role{platform.Migration, platform.API, platform.Worker} {
		cfg, err := platform.LoadConfig(role, "")
		require(t, err)
		pool, err := platform.OpenDatabase(ctx, cfg)
		require(t, err)
		pools[role] = pool
		t.Cleanup(pool.Close)
	}
	admin, api, worker := pools[platform.Migration], pools[platform.API], pools[platform.Worker]
	files, err := migrate.LoadFiles("/workspace/supabase/migrations")
	require(t, err)
	logger := platform.NewLogger(io.Discard, "error")
	status, err := migrate.Run(ctx, admin, files, true, logger)
	require(t, err)
	if !status.Ready || status.AppVersion != migrate.PushReceiptsVersion {
		t.Fatal("push receipt schema not ready")
	}
	apiCfg, err := platform.LoadConfig(platform.API, "")
	require(t, err)
	ac, err := auth.ParseConfig(func(key string) string {
		switch key {
		case "APP_ENV":
			return "test"
		case "PUBLIC_WEB_URL":
			return "https://app.example.invalid"
		case "AUTH_DEV_LOGIN_ENABLED":
			return "true"
		}
		return ""
	}, apiCfg)
	require(t, err)
	store := &auth.Store{Pool: api, Config: ac}
	token, view, err := store.DevLogin(ctx, "", "buyer_b")
	require(t, err)
	pushToken := "ExpoPushToken[receipt-omitted-token]"
	_, err = admin.Exec(ctx, `INSERT INTO summergear_app.push_devices(member_id,session_hash,token,platform,active)
 VALUES($1,$2,$3,'android',true)`, view.Member.ID, hashToken(token), pushToken)
	require(t, err)
	var deviceID string
	require(t, admin.QueryRow(ctx, `SELECT id::text FROM summergear_app.push_devices WHERE token=$1`, pushToken).Scan(&deviceID))
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), `DELETE FROM summergear_app.notification_deliveries WHERE device_id=$1`, deviceID)
		_, _ = admin.Exec(context.Background(), `DELETE FROM summergear_app.notification_events WHERE member_id=$1`, view.Member.ID)
		_, _ = admin.Exec(context.Background(), `DELETE FROM summergear_app.push_devices WHERE token=$1`, pushToken)
		_, _ = admin.Exec(context.Background(), `DELETE FROM summergear_app.auth_sessions WHERE token_hash=$1`, hashToken(token))
	})
	var eventID string
	require(t, admin.QueryRow(ctx, `INSERT INTO summergear_app.notification_events(event_key,member_id,actor_member_id,kind,resource_id,next_attempt_at)
 VALUES($1,$2,$2,'chat_message',$3,clock_timestamp()) RETURNING id::text`, uuid.NewString(), view.Member.ID, uuid.NewString()).Scan(&eventID))
	sender := &testSender{tickets: map[string]string{pushToken: "ticket-omit"}, receipts: map[string]Receipt{}}
	dispatcher := &DispatchWorker{Pool: worker, Sender: sender}
	reconciler := &ReconcileWorker{Pool: worker, Sender: sender}
	require(t, dispatcher.Dispatch(ctx))
	var statusStr string
	require(t, admin.QueryRow(ctx, `SELECT status FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&statusStr))
	if statusStr != "receipt_pending" {
		t.Fatalf("expected receipt_pending, got %s", statusStr)
	}
	_, err = admin.Exec(ctx, `UPDATE summergear_app.notification_deliveries SET ticket_received_at=clock_timestamp()-interval '16 minutes' WHERE event_id=$1`, eventID)
	require(t, err)
	_, err = admin.Exec(ctx, `UPDATE summergear_app.notification_events SET next_attempt_at=clock_timestamp() WHERE id=$1`, eventID)
	require(t, err)
	sender.receiptErr = errors.New("fixture transport failure")
	require(t, reconciler.Reconcile(ctx))
	if sender.ReceiptCount() != 1 {
		t.Fatal("receipt provider was not queried")
	}
	require(t, reconciler.Reconcile(ctx))
	if sender.ReceiptCount() != 1 {
		t.Fatal("receipt backoff was ignored")
	}
	sender.receiptErr = nil
	_, err = admin.Exec(ctx, `UPDATE summergear_app.notification_events SET next_attempt_at=clock_timestamp() WHERE id=$1`, eventID)
	require(t, err)
	// Receipt not ready yet: omitted from response.
	require(t, reconciler.Reconcile(ctx))
	require(t, admin.QueryRow(ctx, `SELECT status FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&statusStr))
	if statusStr != "receipt_pending" {
		t.Fatalf("omitted receipt must keep event pending, got %s", statusStr)
	}
	var receiptStatus string
	require(t, admin.QueryRow(ctx, `SELECT receipt_status FROM summergear_app.notification_deliveries WHERE event_id=$1`, eventID).Scan(&receiptStatus))
	if receiptStatus != "pending" {
		t.Fatalf("omitted receipt must stay pending, got %s", receiptStatus)
	}
	// Simulate 24 hours passing without a receipt.
	_, err = admin.Exec(ctx, `UPDATE summergear_app.notification_deliveries SET ticket_received_at=clock_timestamp()-interval '25 hours' WHERE event_id=$1`, eventID)
	require(t, err)
	_, err = admin.Exec(ctx, `UPDATE summergear_app.notification_events SET next_attempt_at=clock_timestamp() WHERE id=$1`, eventID)
	require(t, err)
	require(t, reconciler.Reconcile(ctx))
	require(t, admin.QueryRow(ctx, `SELECT status,last_error_code FROM summergear_app.notification_events WHERE id=$1`, eventID).Scan(&statusStr, &receiptStatus))
	if statusStr != "failed" {
		t.Fatalf("expected failed after 24h timeout, got %s", statusStr)
	}
	if receiptStatus != "receipt_timeout" {
		t.Fatalf("expected receipt_timeout error code, got %s", receiptStatus)
	}
}

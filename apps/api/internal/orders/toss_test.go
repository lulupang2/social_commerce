package orders

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTossTransportAndAuthoritativeState(t *testing.T) {
	id := "11111111-1111-4111-8111-111111111111"
	status, currency, balance := "DONE", "KRW", int64(12000)
	failConfirm := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()
		if !ok || user != "test_gsk_fixture" || pass != "" {
			t.Error("missing server authentication")
		}
		if r.Method == "POST" {
			if r.Header.Get("Idempotency-Key") == "" {
				t.Error("missing idempotency")
			}
			if strings.HasSuffix(r.URL.Path, "/confirm") {
				if failConfirm {
					w.WriteHeader(500)
					return
				}
				var input ConfirmPaymentRequest
				var body map[string]json.RawMessage
				if json.NewDecoder(r.Body).Decode(&body) != nil {
					t.Error("invalid confirm body")
				}
				_ = json.Unmarshal(body["paymentKey"], &input.PaymentKey)
				_ = json.Unmarshal(body["amount"], &input.Amount)
				if input.PaymentKey != "test-payment-key" || input.Amount != 12000 {
					t.Error("wrong confirm contract")
				}
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"orderId": id, "paymentKey": "test-payment-key", "totalAmount": 12000, "balanceAmount": balance, "currency": currency, "status": status})
	}))
	defer server.Close()
	pg := &TossPG{secretKey: "test_gsk_fixture", client: server.Client(), baseURL: server.URL}
	ctx := context.Background()
	s, err := pg.Approve(ctx, "", id, 12000, "test-payment-key")
	if err != nil || s.Status != "approved" || s.Provider != "toss_test" {
		t.Fatal("approval not verified", err)
	}
	failConfirm = true
	if _, err = pg.Approve(ctx, "", id, 12000, "test-payment-key"); err != nil {
		t.Fatal("lost confirmation did not reconcile", err)
	}
	if _, err = pg.Approve(ctx, "", id, 13000, "test-payment-key"); err == nil {
		t.Fatal("amount mismatch accepted")
	}
	if _, err = pg.Lookup(ctx, "", "fake-pay-"+id); err == nil {
		t.Fatal("fixture key accepted")
	}
	currency = "USD"
	if _, err = pg.Lookup(ctx, "", "test-payment-key"); err == nil {
		t.Fatal("currency accepted")
	}
	currency = "KRW"
	status = "PARTIAL_CANCELED"
	if _, err = pg.Lookup(ctx, "", "test-payment-key"); err == nil {
		t.Fatal("partial cancellation accepted")
	}
	status = "CANCELED"
	balance = 0
	for range 2 {
		s, err = pg.Cancel(ctx, "", "test-payment-key")
		if err != nil || s.Status != "cancelled" {
			t.Fatal("full cancellation failed", err)
		}
	}
	status = "IN_PROGRESS"
	if _, err = pg.Lookup(ctx, "", "test-payment-key"); err == nil {
		t.Fatal("unknown result treated as final")
	}
}

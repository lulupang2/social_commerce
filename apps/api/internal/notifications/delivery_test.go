package notifications

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExpoSenderTicketAndRoute(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.Header.Get("Authorization") != "Bearer fixture-secret" {
			t.Error("push authorization or method missing")
		}
		var payload struct {
			To   string `json:"to"`
			Data struct {
				Route string `json:"route"`
			} `json:"data"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
			return
		}
		if payload.To != "ExpoPushToken[fixture-device-123456789012]" || payload.Data.Route != "/chat/00000000-0000-4000-8000-000000000011" {
			t.Error("push destination or deep link changed")
		}
		_, _ = w.Write([]byte(`{"data":{"status":"ok","id":"fixture-ticket"}}`))
	}))
	defer server.Close()
	sender := &ExpoSender{URL: server.URL, Client: server.Client(), AccessToken: "fixture-secret"}
	ticket, err := sender.Send(context.Background(), "ExpoPushToken[fixture-device-123456789012]", "거래 메시지", "도착", "/chat/00000000-0000-4000-8000-000000000011")
	if err != nil || ticket.Expired || ticket.ID != "fixture-ticket" {
		t.Fatalf("valid Expo ticket failed: %v ticket=%+v", err, ticket)
	}
}

func TestExpoSenderExpiredDeviceAndRetryableFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"status":"error","details":{"error":"DeviceNotRegistered"}}}`))
	}))
	defer server.Close()
	sender := &ExpoSender{URL: server.URL, Client: server.Client()}
	ticket, err := sender.Send(context.Background(), "ExpoPushToken[fixture-device-123456789012]", "title", "body", "/my/listings")
	if !ticket.Expired || err != nil {
		t.Fatalf("expired token must be disabled: %v ticket=%+v", err, ticket)
	}
	server.Close()
	_, err = sender.Send(context.Background(), "ExpoPushToken[fixture-device-123456789012]", "title", "body", "/my/listings")
	if err == nil {
		t.Fatal("transport failure cannot be treated as delivered")
	}
}

func TestExpoSenderGetReceiptsOKAndError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			IDs []string `json:"ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
			return
		}
		if len(payload.IDs) == 1 && payload.IDs[0] == "ticket-a" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":{"ticket-a":{"status":"ok"}}}`))
			return
		}
		if len(payload.IDs) == 1 && payload.IDs[0] == "ticket-b" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":{"ticket-b":{"status":"error","message":"...","details":{"error":"DeviceNotRegistered"}}}}`))
			return
		}
		t.Errorf("unexpected receipt request ids=%v", payload.IDs)
	}))
	defer server.Close()
	sender := &ExpoSender{URL: server.URL, Client: server.Client()}
	receipts, err := sender.GetReceipts(context.Background(), []string{"ticket-a"})
	if err != nil {
		t.Fatalf("get receipts failed: %v", err)
	}
	if r, ok := receipts["ticket-a"]; !ok || r.Status != "ok" || r.Details != "" {
		t.Fatalf("expected ok receipt, got %+v", r)
	}
	receipts, err = sender.GetReceipts(context.Background(), []string{"ticket-b"})
	if err != nil {
		t.Fatalf("get receipts failed: %v", err)
	}
	if r, ok := receipts["ticket-b"]; !ok || r.Status != "error" || r.Details != "DeviceNotRegistered" {
		t.Fatalf("expected DeviceNotRegistered receipt, got %+v", r)
	}
}

func TestExpoSenderGetReceiptsOmittedAndTransport(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Receipt not ready: omit the ticket from the response data.
		_, _ = w.Write([]byte(`{"data":{}}`))
	}))
	defer server.Close()
	sender := &ExpoSender{URL: server.URL, Client: server.Client()}
	receipts, err := sender.GetReceipts(context.Background(), []string{"ticket-pending"})
	if err != nil {
		t.Fatalf("get receipts failed: %v", err)
	}
	if _, ok := receipts["ticket-pending"]; ok {
		t.Fatal("omitted receipt must not be reported as ready")
	}
	server.Close()
	_, err = sender.GetReceipts(context.Background(), []string{"ticket-pending"})
	if err == nil {
		t.Fatal("transport failure must be returned")
	}
}

func TestExpoSenderRejectsAcceptedTicketWithoutID(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"status":"ok"}}`))
	}))
	defer server.Close()
	sender := &ExpoSender{URL: server.URL, Client: server.Client()}
	if ticket, err := sender.Send(context.Background(), "ExpoPushToken[fixture-device-123456789012]", "title", "body", "/my/listings"); err == nil || ticket.ID != "" {
		t.Fatalf("untrackable accepted ticket must not be persisted: %+v, %v", ticket, err)
	}
}

func TestExpoSenderSanitizesBatchedReceiptFailures(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			IDs []string `json:"ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
			return
		}
		if len(payload.IDs) != 2 || payload.IDs[0] != "a" || payload.IDs[1] != "b" {
			t.Errorf("unexpected receipt batch: %v", payload.IDs)
		}
		_, _ = w.Write([]byte(`{"data":{"a":{"status":"ok"},"b":{"status":"error","details":{"error":"token=private-raw-data"}}}}`))
	}))
	defer server.Close()
	sender := &ExpoSender{URL: server.URL, Client: server.Client()}
	receipts, err := sender.GetReceipts(context.Background(), []string{"a", "b"})
	if err != nil || receipts["a"].Status != "ok" || receipts["b"].Details != "expo_receipt_error" {
		t.Fatalf("batch receipt must retain success and sanitize provider data: %+v, %v", receipts, err)
	}
}

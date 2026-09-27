package orders

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

// Credentials never enter logs, browser responses or persistent PG payloads.
type TossPG struct {
	clientKey, secretKey string
	client               *http.Client
	baseURL              string
}

func ConfiguredGateway(pool *pgxpool.Pool, cfg platform.Config) PGAdapter {
	if cfg.TossSecretKey == "" {
		return NewGateway(pool, cfg.Target == "fixture")
	}
	return &TossPG{clientKey: cfg.TossClientKey, secretKey: cfg.TossSecretKey,
		baseURL: "https://api.tosspayments.com", client: &http.Client{Timeout: 10 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("redirect refused") }}}
}

func gatewayProvider(pg PGAdapter) string {
	if _, ok := pg.(*TossPG); ok {
		return "toss_test"
	}
	return "fake_toss"
}

var paymentKeyPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,200}$`)

func validPaymentKey(pg PGAdapter, order, key string) bool {
	if gatewayProvider(pg) == "fake_toss" {
		return key == "fake-pay-"+order
	}
	return paymentKeyPattern.MatchString(key) && !strings.HasPrefix(key, "fake-pay-")
}

type tossPayment struct {
	PaymentKey    string `json:"paymentKey"`
	OrderID       string `json:"orderId"`
	Currency      string `json:"currency"`
	Status        string `json:"status"`
	TotalAmount   int64  `json:"totalAmount"`
	BalanceAmount int64  `json:"balanceAmount"`
}

func (p *TossPG) call(ctx context.Context, method, path string, body any, idempotency string) (*PaymentState, error) {
	var data []byte
	if body != nil {
		var err error
		data, err = json.Marshal(body)
		if err != nil {
			return nil, ErrInvalid
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, p.baseURL+path, bytes.NewReader(data))
	if err != nil {
		return nil, ErrPGUnknown
	}
	req.SetBasicAuth(p.secretKey, "")
	req.Header.Set("Content-Type", "application/json")
	if idempotency != "" {
		req.Header.Set("Idempotency-Key", idempotency)
	}
	res, err := p.client.Do(req)
	if err != nil {
		return nil, ErrPGUnknown
	}
	defer res.Body.Close()
	// Even a 4xx may mean a previous approval succeeded. Only authoritative lookup
	// may release stock; no error body is exposed or logged.
	if res.StatusCode != http.StatusOK {
		return nil, ErrPGUnknown
	}
	var result tossPayment
	if json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&result) != nil {
		return nil, ErrPGUnknown
	}
	if !validID(result.OrderID) || !paymentKeyPattern.MatchString(result.PaymentKey) || result.Currency != "KRW" || result.TotalAmount <= 0 {
		return nil, ErrPGUnknown
	}
	state := &PaymentState{OrderID: result.OrderID, PaymentKey: result.PaymentKey, Amount: result.TotalAmount, Provider: "toss_test"}
	switch result.Status {
	case "DONE":
		if result.BalanceAmount != result.TotalAmount {
			return nil, ErrPGUnknown
		}
		state.Status = "approved"
	case "CANCELED":
		if result.BalanceAmount != 0 {
			return nil, ErrPGUnknown
		}
		state.Status = "cancelled"
	case "ABORTED", "EXPIRED":
		state.Status = "failed"
	default:
		return nil, ErrPGUnknown
	}
	return state, nil
}
func (p *TossPG) Approve(ctx context.Context, member, order string, amount int64, key string) (*PaymentState, error) {
	if !validID(order) || amount <= 0 || !validPaymentKey(p, order, key) {
		return nil, ErrInvalid
	}
	s, err := p.call(ctx, http.MethodPost, "/v1/payments/confirm", map[string]any{"paymentKey": key, "orderId": order, "amount": amount}, "approve-"+order)
	if err != nil {
		s, err = p.Lookup(ctx, member, key)
	}
	if err == nil && (s.OrderID != order || s.PaymentKey != key || s.Amount != amount) {
		return nil, ErrPGUnknown
	}
	return s, err
}
func (p *TossPG) Lookup(ctx context.Context, _ string, key string) (*PaymentState, error) {
	if !paymentKeyPattern.MatchString(key) || strings.HasPrefix(key, "fake-pay-") {
		return nil, ErrInvalid
	}
	s, err := p.call(ctx, http.MethodGet, "/v1/payments/"+url.PathEscape(key), nil, "")
	if err == nil && s.PaymentKey != key {
		return nil, ErrPGUnknown
	}
	return s, err
}
func (p *TossPG) Cancel(ctx context.Context, member, key string) (*PaymentState, error) {
	if !paymentKeyPattern.MatchString(key) || strings.HasPrefix(key, "fake-pay-") {
		return nil, ErrInvalid
	}
	hash := sha256.Sum256([]byte(key))
	s, err := p.call(ctx, http.MethodPost, "/v1/payments/"+url.PathEscape(key)+"/cancel", map[string]string{"cancelReason": "구매자 테스트 결제 전체 취소"}, "cancel-"+hex.EncodeToString(hash[:]))
	if err != nil {
		s, err = p.Lookup(ctx, member, key)
	}
	if err == nil && (s.PaymentKey != key || s.Status != "cancelled") {
		return nil, ErrPGUnknown
	}
	return s, err
}

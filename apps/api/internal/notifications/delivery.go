package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
)

// PushSender is the only external I/O boundary. No token or provider body is logged.
type PushSender interface {
	// Send returns a ticket when Expo accepts the push. Expired is true when the
	// token is rejected as unregistered. Err signals a transport or unrecoverable
	// provider failure.
	Send(context.Context, string, string, string, string) (Ticket, error)
	// GetReceipts asks Expo for the delivery status of previously accepted tickets.
	// The returned map omits IDs whose receipts are not yet ready.
	GetReceipts(context.Context, []string) (map[string]Receipt, error)
}

// Ticket is Expo's response to a successful /push/send request.
type Ticket struct {
	ID      string
	Expired bool
}

// Receipt is the sanitized result of a /getReceipts lookup.
type Receipt struct {
	Status  string // ok, error
	Details string // sanitized error type such as DeviceNotRegistered
}

type ExpoSender struct {
	Client      *http.Client
	AccessToken string
	URL         string // Empty uses the official Expo endpoint; tests inject a local server.
}

func (s *ExpoSender) Send(ctx context.Context, token, title, body, route string) (Ticket, error) {
	payload, err := json.Marshal(struct {
		To    string `json:"to"`
		Title string `json:"title"`
		Body  string `json:"body"`
		Data  struct {
			Route string `json:"route"`
		} `json:"data"`
	}{To: token, Title: title, Body: body, Data: struct {
		Route string `json:"route"`
	}{Route: route}})
	if err != nil {
		return Ticket{}, err
	}
	endpoint := s.URL
	if endpoint == "" {
		endpoint = "https://exp.host/--/api/v2/push/send"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return Ticket{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if s.AccessToken != "" {
		req.Header.Set("Authorization", "Bearer "+s.AccessToken)
	}
	client := s.Client
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return Ticket{}, errors.New("expo_transport_failure")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return Ticket{}, errors.New("expo_http_failure")
	}
	var response struct {
		Data struct {
			Status  string `json:"status"`
			ID      string `json:"id"`
			Details struct {
				Error string `json:"error"`
			} `json:"details"`
		} `json:"data"`
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&response); err != nil {
		return Ticket{}, errors.New("expo_invalid_response")
	}
	if response.Data.Status == "ok" {
		if response.Data.ID == "" || len(response.Data.ID) > 200 || strings.TrimSpace(response.Data.ID) != response.Data.ID || strings.IndexFunc(response.Data.ID, func(r rune) bool { return r < ' ' || r == 127 }) >= 0 {
			return Ticket{}, errors.New("expo_invalid_ticket")
		}
		return Ticket{ID: response.Data.ID}, nil
	}
	if response.Data.Details.Error == "DeviceNotRegistered" {
		return Ticket{Expired: true}, nil
	}
	return Ticket{}, errors.New("expo_ticket_rejected")
}

func (s *ExpoSender) GetReceipts(ctx context.Context, ids []string) (map[string]Receipt, error) {
	if len(ids) == 0 {
		return map[string]Receipt{}, nil
	}
	payload, err := json.Marshal(struct {
		IDs []string `json:"ids"`
	}{IDs: ids})
	if err != nil {
		return nil, err
	}
	endpoint := s.URL
	if endpoint == "" {
		endpoint = "https://exp.host/--/api/v2/push/getReceipts"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if s.AccessToken != "" {
		req.Header.Set("Authorization", "Bearer "+s.AccessToken)
	}
	client := s.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, errors.New("expo_transport_failure")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, errors.New("expo_http_failure")
	}
	var response struct {
		Data map[string]struct {
			Status  string `json:"status"`
			Details struct {
				Error string `json:"error"`
			} `json:"details"`
		} `json:"data"`
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&response); err != nil || response.Data == nil {
		return nil, errors.New("expo_invalid_response")
	}
	result := make(map[string]Receipt, len(response.Data))
	for id, item := range response.Data {
		switch item.Status {
		case "ok":
			result[id] = Receipt{Status: "ok"}
		case "error":
			result[id] = Receipt{Status: "error", Details: receiptErrorCode(item.Details.Error)}
		default:
			return nil, errors.New("expo_invalid_response")
		}
	}
	return result, nil
}

func receiptErrorCode(code string) string {
	switch code {
	case "DeviceNotRegistered", "MessageTooBig", "MessageRateExceeded", "MismatchSenderId", "InvalidCredentials":
		return code
	default:
		return "expo_receipt_error"
	}
}

type DispatchArgs struct {
	Version int `json:"version"`
}

func (DispatchArgs) Kind() string { return "summergear_push_dispatch_v1" }

type DispatchWorker struct {
	river.WorkerDefaults[DispatchArgs]
	Pool   *pgxpool.Pool
	Sender PushSender
}

func (w *DispatchWorker) Work(ctx context.Context, job *river.Job[DispatchArgs]) error {
	if job.Args.Version != 1 {
		return river.JobCancel(errors.New("unsupported push job version"))
	}
	return w.Dispatch(ctx)
}

// Each event is row-locked while delivery is attempted; concurrent workers
// cannot send the same event simultaneously. The delivery ledger bounds retries,
// but a crash between provider success and DB commit can still duplicate a push.
func (w *DispatchWorker) Dispatch(ctx context.Context) error {
	for range 10 {
		processed, err := w.dispatchOne(ctx)
		if err != nil {
			return err
		}
		if !processed {
			return nil
		}
	}
	return nil
}

func (w *DispatchWorker) dispatchOne(ctx context.Context) (bool, error) {
	tx, err := w.Pool.Begin(ctx)
	if err != nil {
		return false, errors.New("push_db_unavailable")
	}
	defer tx.Rollback(context.Background())
	var id, member, kind, resource string
	var attempts int
	err = tx.QueryRow(ctx, `SELECT id::text,member_id::text,kind,resource_id::text,attempts
 FROM summergear_app.notification_events WHERE status='pending' AND next_attempt_at<=clock_timestamp()
 ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`).Scan(&id, &member, &kind, &resource, &attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, errors.New("push_db_unavailable")
	}
	title, body, route := notificationText(kind, resource)
	if route == "" {
		return false, errors.New("unsupported_push_event")
	}
	rows, err := tx.Query(ctx, `SELECT d.id::text,d.token FROM summergear_app.push_devices d
 WHERE d.member_id=$1 AND d.active
 AND summergear_app.active_push_session(d.session_hash,d.member_id)
 AND NOT EXISTS (SELECT 1 FROM summergear_app.notification_deliveries n
   WHERE n.event_id=$2 AND n.device_id=d.id)
 ORDER BY d.id FOR UPDATE OF d`, member, id)
	if err != nil {
		return false, errors.New("push_db_unavailable")
	}
	type device struct{ id, token string }
	devices := make([]device, 0)
	for rows.Next() {
		var d device
		if err = rows.Scan(&d.id, &d.token); err != nil {
			rows.Close()
			return false, errors.New("push_db_unavailable")
		}
		devices = append(devices, d)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return false, errors.New("push_db_unavailable")
	}
	var failedDevices []string
	var hasExpired bool
	for _, d := range devices {
		ticket, sendErr := w.Sender.Send(ctx, d.token, title, body, route)
		if sendErr != nil {
			failedDevices = append(failedDevices, d.id)
			continue
		}
		if ticket.Expired {
			if _, err = tx.Exec(ctx, `UPDATE summergear_app.push_devices SET active=false,updated_at=clock_timestamp() WHERE id=$1`, d.id); err != nil {
				return false, errors.New("push_db_unavailable")
			}
			if _, err = tx.Exec(ctx, `INSERT INTO summergear_app.notification_deliveries(event_id,device_id,receipt_status,receipt_checked_at,last_receipt_error)
 VALUES($1,$2,'error',clock_timestamp(),'DeviceNotRegistered') ON CONFLICT DO NOTHING`, id, d.id); err != nil {
				return false, errors.New("push_db_unavailable")
			}
			hasExpired = true
			continue
		}
		if ticket.ID == "" {
			failedDevices = append(failedDevices, d.id)
			continue
		}
		if _, err = tx.Exec(ctx, `INSERT INTO summergear_app.notification_deliveries(event_id,device_id,ticket_id,ticket_received_at,receipt_status)
 VALUES($1,$2,$3,clock_timestamp(),'pending') ON CONFLICT DO NOTHING`, id, d.id, ticket.ID); err != nil {
			return false, errors.New("push_db_unavailable")
		}
	}
	if len(failedDevices) > 0 && attempts+1 < 5 {
		_, err = tx.Exec(ctx, `UPDATE summergear_app.notification_events SET status='pending',attempts=attempts+1,
 last_error_code='expo_delivery_failed',next_attempt_at=clock_timestamp()+LEAST(power(2,$2::numeric),3600)*interval '1 second'
 WHERE id=$1`, id, attempts+1)
	} else {
		for _, deviceID := range failedDevices {
			if _, err = tx.Exec(ctx, `INSERT INTO summergear_app.notification_deliveries(event_id,device_id,receipt_status,receipt_checked_at,last_receipt_error)
 VALUES($1,$2,'error',clock_timestamp(),'expo_delivery_failed') ON CONFLICT DO NOTHING`, id, deviceID); err != nil {
				return false, errors.New("push_db_unavailable")
			}
		}
		var accepted int
		if err = tx.QueryRow(ctx, `SELECT count(*) FROM summergear_app.notification_deliveries
 WHERE event_id=$1 AND ticket_id IS NOT NULL`, id).Scan(&accepted); err != nil {
			return false, errors.New("push_db_unavailable")
		}
		switch {
		case accepted > 0:
			_, err = tx.Exec(ctx, `UPDATE summergear_app.notification_events SET status='receipt_pending',attempts=attempts+1,
 last_error_code=NULL,next_attempt_at=clock_timestamp()+interval '1 minute' WHERE id=$1`, id)
		case len(failedDevices) > 0:
			_, err = tx.Exec(ctx, `UPDATE summergear_app.notification_events SET status='failed',attempts=attempts+1,
 last_error_code='expo_delivery_failed' WHERE id=$1`, id)
		case hasExpired || len(devices) == 0:
			_, err = tx.Exec(ctx, `UPDATE summergear_app.notification_events SET status='skipped',attempts=attempts+1,
 last_error_code=NULL WHERE id=$1`, id)
		}
	}
	if err != nil {
		return false, errors.New("push_db_unavailable")
	}
	if err = tx.Commit(ctx); err != nil {
		return false, errors.New("push_db_unavailable")
	}
	return true, nil
}

type ReconcileArgs struct {
	Version int `json:"version"`
}

func (ReconcileArgs) Kind() string { return "summergear_push_reconcile_v1" }

type ReconcileWorker struct {
	river.WorkerDefaults[ReconcileArgs]
	Pool          *pgxpool.Pool
	Sender        PushSender
	MinReceiptAge time.Duration // Minimum age of a ticket before asking Expo for its receipt.
}

func (w *ReconcileWorker) Work(ctx context.Context, job *river.Job[ReconcileArgs]) error {
	if job.Args.Version != 1 {
		return river.JobCancel(errors.New("unsupported reconcile job version"))
	}
	return w.Reconcile(ctx)
}

// Reconcile checks receipts for events that already have an Expo ticket.
// It stops after a bounded number of events so that retries are spread across
// periodic runs. Receipts expire after 24h; missing receipts become 'unknown'.
func (w *ReconcileWorker) Reconcile(ctx context.Context) error {
	for range 10 {
		processed, err := w.reconcileOne(ctx)
		if err != nil {
			return err
		}
		if !processed {
			return nil
		}
	}
	return nil
}

func (w *ReconcileWorker) reconcileOne(ctx context.Context) (bool, error) {
	tx, err := w.Pool.Begin(ctx)
	if err != nil {
		return false, errors.New("push_db_unavailable")
	}
	defer tx.Rollback(context.Background())
	var id string
	var attempts int
	// Lock the oldest receipt-pending event that has at least one ticket ready to check.
	minAge := w.MinReceiptAge
	if minAge <= 0 {
		minAge = 15 * time.Minute
	}
	err = tx.QueryRow(ctx, `SELECT e.id::text,e.attempts
 FROM summergear_app.notification_events e
 WHERE e.status='receipt_pending' AND e.next_attempt_at<=clock_timestamp()
   AND EXISTS (SELECT 1 FROM summergear_app.notification_deliveries d
     WHERE d.event_id=e.id AND d.ticket_id IS NOT NULL AND d.receipt_status='pending'
       AND d.ticket_received_at<=clock_timestamp() - $1 * interval '1 second')
 ORDER BY e.next_attempt_at,e.id LIMIT 1 FOR UPDATE SKIP LOCKED`, minAge.Seconds()).Scan(&id, &attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, errors.New("push_db_unavailable")
	}
	// Timeout any ticket older than 24h before asking Expo again.
	if _, err = tx.Exec(ctx, `UPDATE summergear_app.notification_deliveries
 SET receipt_status='unknown',receipt_checked_at=clock_timestamp(),last_receipt_error='receipt_timeout'
 WHERE event_id=$1 AND ticket_id IS NOT NULL AND receipt_status='pending' AND ticket_received_at<clock_timestamp()-interval '24 hours'`, id); err != nil {
		return false, errors.New("push_db_unavailable")
	}
	rows, err := tx.Query(ctx, `SELECT d.device_id::text,d.ticket_id,d.ticket_received_at
 FROM summergear_app.notification_deliveries d
 WHERE d.event_id=$1 AND d.ticket_id IS NOT NULL AND d.receipt_status='pending'
   AND d.ticket_received_at<=clock_timestamp() - $2 * interval '1 second'
 ORDER BY d.ticket_received_at,d.device_id`, id, minAge.Seconds())
	if err != nil {
		return false, errors.New("push_db_unavailable")
	}
	type pendingTicket struct {
		deviceID   string
		id         string
		receivedAt time.Time
	}
	var tickets []pendingTicket
	for rows.Next() {
		var t pendingTicket
		if err = rows.Scan(&t.deviceID, &t.id, &t.receivedAt); err != nil {
			rows.Close()
			return false, errors.New("push_db_unavailable")
		}
		tickets = append(tickets, t)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return false, errors.New("push_db_unavailable")
	}
	var ids []string
	for _, t := range tickets {
		ids = append(ids, t.id)
	}
	var receipts map[string]Receipt
	if len(ids) > 0 {
		receipts, err = w.Sender.GetReceipts(ctx, ids)
		if err != nil {
			// Retry later without blocking on a transient provider failure.
			_, updateErr := tx.Exec(ctx, `UPDATE summergear_app.notification_events SET attempts=attempts+1,
 next_attempt_at=clock_timestamp()+LEAST(power(2,$2::numeric),3600)*interval '1 second',
 last_error_code='expo_receipt_transport' WHERE id=$1`, id, attempts+1)
			if updateErr != nil {
				return false, errors.New("push_db_unavailable")
			}
			if commitErr := tx.Commit(ctx); commitErr != nil {
				return false, errors.New("push_db_unavailable")
			}
			return true, nil
		}
	}
	checkedAt := time.Now()
	for _, t := range tickets {
		receipt, ok := receipts[t.id]
		if !ok {
			// Receipt not ready yet; leave pending.
			continue
		}
		if receipt.Status == "ok" {
			if _, err = tx.Exec(ctx, `UPDATE summergear_app.notification_deliveries
 SET receipt_status='ok',receipt_checked_at=$3,delivered_at=$3,receipt_details=NULL,last_receipt_error=NULL
 WHERE event_id=$1 AND ticket_id=$2`, id, t.id, checkedAt); err != nil {
				return false, errors.New("push_db_unavailable")
			}
			continue
		}
		code := receiptErrorCode(receipt.Details)
		if code == "DeviceNotRegistered" {
			if _, err = tx.Exec(ctx, `UPDATE summergear_app.push_devices SET active=false,updated_at=clock_timestamp()
 WHERE id=$1 AND updated_at<= $2`, t.deviceID, t.receivedAt); err != nil {
				return false, errors.New("push_db_unavailable")
			}
		}
		if _, err = tx.Exec(ctx, `UPDATE summergear_app.notification_deliveries
 SET receipt_status='error',receipt_checked_at=$3,receipt_details=$4,last_receipt_error=$4
 WHERE event_id=$1 AND ticket_id=$2`, id, t.id, checkedAt, code); err != nil {
			return false, errors.New("push_db_unavailable")
		}
	}
	// Aggregate per-device results into a single event status.
	var pending, okCount, errCount, unknownCount int
	err = tx.QueryRow(ctx, `SELECT
  count(*) FILTER (WHERE receipt_status='pending'),
  count(*) FILTER (WHERE receipt_status='ok'),
  count(*) FILTER (WHERE receipt_status='error'),
  count(*) FILTER (WHERE receipt_status='unknown')
 FROM summergear_app.notification_deliveries WHERE event_id=$1`, id).Scan(&pending, &okCount, &errCount, &unknownCount)
	if err != nil {
		return false, errors.New("push_db_unavailable")
	}
	var lastErrorCode string
	if errCount > 0 || unknownCount > 0 {
		if err = tx.QueryRow(ctx, `SELECT last_receipt_error FROM summergear_app.notification_deliveries
 WHERE event_id=$1 AND last_receipt_error IS NOT NULL ORDER BY receipt_checked_at DESC LIMIT 1`, id).Scan(&lastErrorCode); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return false, errors.New("push_db_unavailable")
		}
	}
	if pending == 0 {
		if errCount > 0 || unknownCount > 0 {
			_, err = tx.Exec(ctx, `UPDATE summergear_app.notification_events SET status='failed',attempts=attempts+1,
 last_error_code=$2 WHERE id=$1`, id, lastErrorCode)
		} else if okCount > 0 {
			_, err = tx.Exec(ctx, `UPDATE summergear_app.notification_events SET status='sent',attempts=attempts+1,
 last_error_code=NULL,delivered_at=clock_timestamp() WHERE id=$1`, id)
		} else {
			_, err = tx.Exec(ctx, `UPDATE summergear_app.notification_events SET status='skipped',attempts=attempts+1,
 last_error_code=NULL WHERE id=$1`, id)
		}
	} else {
		_, err = tx.Exec(ctx, `UPDATE summergear_app.notification_events SET attempts=attempts+1,
 next_attempt_at=clock_timestamp()+LEAST(power(2,$2::numeric),3600)*interval '1 second'
 WHERE id=$1`, id, attempts+1)
	}
	if err != nil {
		return false, errors.New("push_db_unavailable")
	}
	if err = tx.Commit(ctx); err != nil {
		return false, errors.New("push_db_unavailable")
	}
	return true, nil
}

func notificationText(kind, resource string) (string, string, string) {
	switch kind {
	case "chat_message":
		return "새 거래 메시지", "새 메시지가 도착했습니다.", fmt.Sprintf("/chat/%s", resource)
	case "listing_review":
		return "매물 검토 결과", "매물의 검토 결과를 확인해 주세요.", "/my/listings"
	case "community_review":
		return "게시글 검토 결과", "게시글의 검토 결과를 확인해 주세요.", "/community"
	default:
		return "", "", ""
	}
}

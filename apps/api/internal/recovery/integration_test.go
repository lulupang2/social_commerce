//go:build integration

package recovery

import (
	"context"
	"errors"
	"io"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/jobs"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/orders"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
	"github.com/riverqueue/river"
)

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func TestOperatorRecoveryRequiresProviderEvidence(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" || os.Getenv("DB_TARGET") != "fixture" || os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("disposable fixture required")
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
	status, err := migrate.Run(ctx, admin, files, true, platform.NewLogger(io.Discard, "error"))
	must(t, err)
	if !status.Ready || status.AppVersion != migrate.PushReceiptsVersion {
		t.Fatal("recovery schema not ready")
	}
	member := func(label string) string {
		var id string
		must(t, admin.QueryRow(ctx,
			`INSERT INTO summergear_app.members(display_name,onboarded) VALUES($1,true) RETURNING id::text`, label).Scan(&id))
		return id
	}
	buyer, seller, reviewer := member("Recovery buyer"), member("Recovery seller"), member("Recovery operator")
	_, err = admin.Exec(ctx, `INSERT INTO summergear_app.listing_reviewers(member_id) VALUES($1)`, reviewer)
	must(t, err)
	var sellerID string
	must(t, admin.QueryRow(ctx, `INSERT INTO summergear_app.sellers(type,display_name,status)
 VALUES('individual','Recovery seller','approved') RETURNING id::text`).Scan(&sellerID))
	_, err = admin.Exec(ctx, `INSERT INTO summergear_app.seller_memberships(seller_id,member_id,is_owner) VALUES($1,$2,true)`, sellerID, seller)
	must(t, err)
	makePending := func() (*orders.Order, string, string) {
		t.Helper()
		var listing string
		must(t, admin.QueryRow(ctx, `INSERT INTO summergear_app.listings(member_id,sport,category,title,description,price_krw,condition,status,details,location_text,published_at)
 VALUES($1,'surf','equipment','Recovery board','Isolated provider evidence test',12000,'good','active','{"sport":"surf"}','Fixture',clock_timestamp()) RETURNING id::text`, seller).Scan(&listing))
		_, err := admin.Exec(ctx, `INSERT INTO summergear_app.inventory_items(listing_id,seller_id,available_quantity) VALUES($1,$2,1)`, listing, sellerID)
		must(t, err)
		order, err := (&orders.Store{Pool: api}).CreateOrder(ctx, buyer, listing, 1)
		must(t, err)
		key := "fake-pay-" + order.ID
		var attempt string
		must(t, admin.QueryRow(ctx, `INSERT INTO summergear_app.payment_attempts(order_id,pg_payment_key,requested_amount,idempotency_key,pg_provider)
 VALUES($1,$2,$3,$4,'fake_toss') RETURNING id::text`, order.ID, key, order.TotalAmountKRW, "fixture-recovery-"+order.ID).Scan(&attempt))
		_, err = admin.Exec(ctx, `UPDATE summergear_app.orders SET payment_status='pending_approval' WHERE id=$1`, order.ID)
		must(t, err)
		return order, attempt, key
	}
	client, err := jobs.NewClient(api, configs[platform.API], platform.NewLogger(io.Discard, "error"), false)
	must(t, err)
	service := &Service{Pool: api, Client: client}
	order, attempt, key := makePending()
	if _, err = service.Dashboard(ctx, buyer); !errors.Is(err, forbidden) {
		t.Fatalf("buyer saw operator queue: %v", err)
	}
	if _, err = service.Recheck(ctx, buyer, attempt, "Buyer cannot retry"); !errors.Is(err, forbidden) {
		t.Fatalf("buyer rechecked payment: %v", err)
	}
	view, err := service.Dashboard(ctx, reviewer)
	must(t, err)
	found := false
	for _, entry := range view.Attempts {
		if entry.ID == attempt && entry.PaymentStatus == "pending_approval" && entry.Recheckable {
			found = true
		}
	}
	if !found {
		t.Fatal("operator queue omitted unknown payment")
	}
	if _, err = service.Recheck(ctx, reviewer, uuid.NewString(), "Missing attempt"); !errors.Is(err, missing) {
		t.Fatalf("missing attempt accepted: %v", err)
	}
	request, err := service.Recheck(ctx, reviewer, attempt, "Lost gateway response; check provider status")
	must(t, err)
	if request.Status != "queued" || request.JobID == nil || request.ActorMemberID != reviewer {
		t.Fatal("recheck was not audited and enqueued")
	}
	replay, err := service.Recheck(ctx, reviewer, attempt, "Duplicate request")
	must(t, err)
	if replay.ID != request.ID || replay.JobID == nil || replay.Reason != request.Reason {
		t.Fatal("duplicate created another provider check")
	}
	var jobCount int
	must(t, admin.QueryRow(ctx, `SELECT count(*) FROM summergear_river.river_job WHERE id=$1 AND kind='summergear_payment_recheck_v1'`, *request.JobID).Scan(&jobCount))
	if jobCount != 1 {
		t.Fatal("River job not persisted with audit")
	}
	// No provider record: worker fails visibly and must not synthesize approval.
	workerJob := &jobs.PaymentRecheckWorker{Pool: worker, PGAdapter: orders.NewGateway(worker, true)}
	must(t, workerJob.Work(ctx, &river.Job[jobs.PaymentRecheckArgs]{Args: jobs.PaymentRecheckArgs{Version: 1, RequestID: request.ID}}))
	var audit, code, paymentStatus string
	must(t, admin.QueryRow(ctx, `SELECT status,last_error_code FROM summergear_app.payment_recovery_requests WHERE id=$1`, request.ID).Scan(&audit, &code))
	must(t, admin.QueryRow(ctx, `SELECT payment_status::text FROM summergear_app.orders WHERE id=$1`, order.ID).Scan(&paymentStatus))
	if audit != "failed" || code == "" || paymentStatus != "pending_approval" {
		t.Fatal("missing provider evidence was treated as approval")
	}
	// The independent fixture gateway then records a real approval; a new
	// operator request can reconcile the previously unknown result.
	state, err := orders.NewGateway(api, true).Approve(ctx, buyer, order.ID, order.TotalAmountKRW, key)
	must(t, err)
	if state.Status != "approved" {
		t.Fatal("fixture gateway did not approve")
	}
	second, err := service.Recheck(ctx, reviewer, attempt, "Gateway approval verified after timeout")
	must(t, err)
	if second.ID == request.ID {
		t.Fatal("finished failure suppressed new check")
	}
	must(t, workerJob.Work(ctx, &river.Job[jobs.PaymentRecheckArgs]{Args: jobs.PaymentRecheckArgs{Version: 1, RequestID: second.ID}}))
	must(t, admin.QueryRow(ctx, `SELECT status FROM summergear_app.payment_recovery_requests WHERE id=$1`, second.ID).Scan(&audit))
	must(t, admin.QueryRow(ctx, `SELECT payment_status::text FROM summergear_app.orders WHERE id=$1`, order.ID).Scan(&paymentStatus))
	if audit != "checked" || paymentStatus != "approved" {
		t.Fatal("authoritative approval not reconciled")
	}
	// A terminal local failure cannot be manually reapproved or queued.
	terminal, terminalAttempt, _ := makePending()
	_, err = admin.Exec(ctx, `UPDATE summergear_app.payment_attempts SET status='failed' WHERE id=$1`, terminalAttempt)
	must(t, err)
	_, err = admin.Exec(ctx, `UPDATE summergear_app.orders SET status='cancelled',payment_status='failed' WHERE id=$1`, terminal.ID)
	must(t, err)
	if _, err = service.Recheck(ctx, reviewer, terminalAttempt, "Force approval"); !errors.Is(err, conflict) {
		t.Fatalf("terminal payment rechecked: %v", err)
	}
}

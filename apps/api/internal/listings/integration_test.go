//go:build integration

package listings

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
	"github.com/lulupang2/social_commerce/apps/api/internal/httpapi"
	"github.com/lulupang2/social_commerce/apps/api/internal/listingimages"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func TestListingSessionOwnershipAndRLS(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" ||
		os.Getenv("DB_TARGET") != "fixture" ||
		os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("listing integration requires the explicit isolated fixture")
	}

	ctx := context.Background()
	pools := map[platform.Role]*pgxpool.Pool{}
	configs := map[platform.Role]platform.Config{}
	for _, role := range []platform.Role{platform.API, platform.Worker, platform.Migration} {
		cfg, err := platform.LoadConfig(role, "")
		must(t, err)
		pool, err := platform.OpenDatabase(ctx, cfg)
		must(t, err)
		configs[role], pools[role] = cfg, pool
		t.Cleanup(pool.Close)
	}

	files, err := migrate.LoadFiles("/workspace/supabase/migrations")
	must(t, err)
	logger := platform.NewLogger(io.Discard, "error")
	status, err := migrate.Run(ctx, pools[platform.Migration], files, true, logger)
	must(t, err)
	if !status.Ready || status.AppVersion != migrate.PushReceiptsVersion {
		t.Fatal("listing migration is not ready")
	}

	values := map[string]string{
		"APP_ENV":                "test",
		"PUBLIC_WEB_URL":         "https://app.example.invalid",
		"AUTH_DEV_LOGIN_ENABLED": "true",
	}
	authConfig, err := auth.ParseConfig(func(key string) string { return values[key] }, configs[platform.API])
	must(t, err)

	store := &Store{Pool: pools[platform.API]}
	imageStore := &listingimages.Store{Pool: pools[platform.API]}
	imageService := &listingimages.Service{Repo: imageStore, Storage: testUnavailableStorage{}}
	app := httpapi.New(logger, func(c context.Context) error {
		if err := (&auth.Store{Pool: pools[platform.API], Config: authConfig}).Ready(c); err != nil {
			return err
		}
		if err := store.Ready(c); err != nil {
			return err
		}
		return imageStore.Ready(c)
	}).App
	authHandler := auth.Register(app, authConfig, pools[platform.API], logger)
	Register(app, pools[platform.API], authHandler, imageService, logger)

	cookies := map[string]string{}
	request := func(method, path, body string, headers map[string]string) (*http.Response, []byte) {
		req := httptest.NewRequest(method, authConfig.PublicURL+path, strings.NewReader(body))
		for name, value := range cookies {
			req.AddCookie(&http.Cookie{Name: name, Value: value})
		}
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		for name, value := range headers {
			req.Header.Set(name, value)
		}
		resp, err := app.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
		must(t, err)
		data, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		must(t, err)
		for _, cookie := range resp.Cookies() {
			if cookie.MaxAge < 0 {
				delete(cookies, cookie.Name)
			} else {
				cookies[cookie.Name] = cookie.Value
			}
		}
		return resp, data
	}

	resp, data := request("POST", auth.Prefix+"/dev-login", "", map[string]string{"Origin": authConfig.PublicURL})
	if resp.StatusCode != 200 {
		t.Fatalf("dev login returned %d", resp.StatusCode)
	}
	var session auth.SessionView
	must(t, json.Unmarshal(data, &session))

	createBody := map[string]any{
		"sport":       "surf",
		"category":    "equipment",
		"title":       "Go API 테스트 서핑보드",
		"description": "Go 서비스 세션 소유권과 RLS를 검증하기 위한 테스트 매물입니다.",
		"priceKrw":    250000,
		"condition":   "good",
		"location":    "양양 죽도",
		"details": map[string]any{
			"sport":           "surf",
			"equipmentType":   "surfboard",
			"discipline":      "shortboard",
			"boardLengthFeet": 5.11,
			"volumeLiters":    32.5,
			"finSystem":       "fcs2",
		},
	}
	encoded, err := json.Marshal(createBody)
	must(t, err)
	mutationHeaders := map[string]string{
		"Origin":       authConfig.PublicURL,
		"X-CSRF-Token": session.CSRFToken,
	}
	resp, data = request("POST", Prefix, string(encoded), mutationHeaders)
	if resp.StatusCode != 201 {
		t.Fatalf("listing create returned %d: %s", resp.StatusCode, string(data))
	}
	var created Listing
	must(t, json.Unmarshal(data, &created))
	if created.Status != "pending_review" || created.Seller.ID != session.Member.ID {
		t.Fatal("listing was not owned by the authenticated member")
	}

	var visible int
	must(t, pools[platform.API].QueryRow(ctx,
		"SELECT count(*) FROM summergear_app.listings WHERE id=$1", created.ID).Scan(&visible))
	if visible != 0 {
		t.Fatal("transaction-scoped member context leaked into a later API query")
	}

	anonymous := func(path string) (*http.Response, []byte) {
		req := httptest.NewRequest("GET", authConfig.PublicURL+path, nil)
		resp, err := app.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
		must(t, err)
		data, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		must(t, err)
		return resp, data
	}
	resp, _ = anonymous(Prefix + "/" + created.ID)
	if resp.StatusCode != 404 {
		t.Fatal("pending listing was publicly readable")
	}

	resp, _ = request("GET", Prefix+"/"+created.ID, "", nil)
	if resp.StatusCode != 200 {
		t.Fatal("owner could not read pending listing")
	}

	patch, _ := json.Marshal(map[string]any{"title": "수정된 Go API 테스트 매물"})
	resp, data = request("PATCH", Prefix+"/"+created.ID, string(patch), mutationHeaders)
	if resp.StatusCode != 200 || !bytes.Contains(data, []byte("수정된 Go API")) {
		t.Fatal("owner could not update listing")
	}

	var otherMember string
	must(t, pools[platform.Migration].QueryRow(ctx,
		"INSERT INTO summergear_app.members(display_name) VALUES('Other fixture member') RETURNING id::text").Scan(&otherMember))
	tx, err := pools[platform.API].Begin(ctx)
	must(t, err)
	defer tx.Rollback(context.Background())
	_, err = tx.Exec(ctx, "SELECT set_config('summergear.member_id',$1,true)", otherMember)
	must(t, err)
	must(t, tx.QueryRow(ctx, "SELECT count(*) FROM summergear_app.listings WHERE id=$1", created.ID).Scan(&visible))
	if visible != 0 {
		t.Fatal("another member could read the pending listing")
	}
	tag, err := tx.Exec(ctx, "UPDATE summergear_app.listings SET title='forbidden' WHERE id=$1", created.ID)
	must(t, err)
	if tag.RowsAffected() != 0 {
		t.Fatal("another member could update the pending listing")
	}
	must(t, tx.Rollback(ctx))

	_, err = pools[platform.Migration].Exec(ctx,
		"UPDATE summergear_app.listings SET status='active',published_at=clock_timestamp() WHERE id=$1", created.ID)
	must(t, err)
	resp, _ = anonymous(Prefix + "/" + created.ID)
	if resp.StatusCode != 200 {
		t.Fatal("active listing was not publicly readable")
	}
	resp, data = anonymous(Prefix + "?search=Go%20API")
	if resp.StatusCode != 200 || !bytes.Contains(data, []byte(created.ID)) {
		t.Fatalf("active listing was not returned by filtered public list: %d %s", resp.StatusCode, data)
	}

	// An active listing is not purchasable until a reviewer approves its
	// applicant and the owner explicitly makes one unit available.
	resp, data = request("GET", "/api/v1/me/seller-application", "", nil)
	var initial SellerStatus
	must(t, json.Unmarshal(data, &initial))
	if resp.StatusCode != 200 || initial.Reviewer || initial.Seller != nil {
		t.Fatalf("applicant has an unexpected role: %d %s", resp.StatusCode, data)
	}
	resp, data = request("POST", "/api/v1/me/seller-application",
		`{"type":"individual","displayName":"거래 테스트 판매자"}`, mutationHeaders)
	if resp.StatusCode != 201 {
		t.Fatalf("seller application: %d %s", resp.StatusCode, data)
	}
	var application SellerApplication
	must(t, json.Unmarshal(data, &application))
	if application.Status != "pending" || application.SellerID != nil {
		t.Fatal("applicant was approved before review")
	}
	if _, err := store.ReviewSellerApplication(ctx, session.Member.ID, application.ID, "approve", ""); !errors.Is(err, errReviewForbidden) {
		t.Fatalf("applicant could approve itself: %v", err)
	}
	if _, err := store.PendingSellerApplications(ctx, otherMember); !errors.Is(err, errReviewForbidden) {
		t.Fatalf("other member could list operator queue: %v", err)
	}
	if _, err := store.SetInventory(ctx, session.Member.ID, created.ID, 1); !errors.Is(err, errNotFound) {
		t.Fatalf("unapproved seller could set inventory: %v", err)
	}
	reviewerID := "00000000-0000-4000-8000-000000000015"
	pending, err := store.PendingSellerApplications(ctx, reviewerID)
	must(t, err)
	found := false
	for _, item := range pending {
		if item.ID == application.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("reviewer queue omitted seller application")
	}
	approved, err := store.ReviewSellerApplication(ctx, reviewerID, application.ID, "approve", "")
	must(t, err)
	if approved.Status != "approved" || approved.SellerID == nil {
		t.Fatal("approval did not create seller membership")
	}
	if _, err := store.ReviewSellerApplication(ctx, reviewerID, application.ID, "approve", ""); !errors.Is(err, errSellerConflict) {
		t.Fatalf("duplicate review did not conflict: %v", err)
	}
	if _, err := store.SetInventory(ctx, otherMember, created.ID, 1); !errors.Is(err, errNotFound) {
		t.Fatalf("non-owner could set inventory: %v", err)
	}
	resp, data = request("PUT", Prefix+"/"+created.ID+"/inventory", `{"availableQuantity":1}`, mutationHeaders)
	if resp.StatusCode != 200 {
		t.Fatalf("stock create: %d %s", resp.StatusCode, data)
	}
	var stock InventoryView
	must(t, json.Unmarshal(data, &stock))
	if stock.AvailableQuantity != 1 || stock.SellerID != *approved.SellerID {
		t.Fatal("stock not bound to approved seller")
	}
	resp, data = request("PUT", Prefix+"/"+created.ID+"/inventory", `{"availableQuantity":0}`, mutationHeaders)
	if resp.StatusCode != 200 {
		t.Fatalf("stock pause: %d %s", resp.StatusCode, data)
	}
	resp, data = request("PUT", Prefix+"/"+created.ID+"/inventory", `{"availableQuantity":1}`, mutationHeaders)
	if resp.StatusCode != 200 {
		t.Fatalf("stock resume: %d %s", resp.StatusCode, data)
	}

	_, err = pools[platform.Worker].Exec(ctx, "SELECT * FROM summergear_app.listings LIMIT 0")
	var pgErr *pgconn.PgError
	if !errorsAs(err, &pgErr) || pgErr.Code != "42501" {
		t.Fatal("worker can access Go listings")
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func errorsAs(err error, target any) bool {
	switch value := target.(type) {
	case **pgconn.PgError:
		if err == nil {
			return false
		}
		pgErr, ok := err.(*pgconn.PgError)
		if ok {
			*value = pgErr
			return true
		}
	}
	return false
}

type testUnavailableStorage struct{}

func (testUnavailableStorage) CreateSignedUpload(context.Context, string) (string, error) {
	return "", errors.New("unused")
}
func (testUnavailableStorage) Info(context.Context, string) (listingimages.ObjectInfo, error) {
	return listingimages.ObjectInfo{}, errors.New("unused")
}
func (testUnavailableStorage) ReadObject(context.Context, string, int64) ([]byte, error) {
	return nil, errors.New("unused")
}
func (testUnavailableStorage) Delete(context.Context, string) error {
	return errors.New("unused")
}
func (testUnavailableStorage) Sign(context.Context, string, time.Duration) (string, error) {
	return "", errors.New("unused")
}

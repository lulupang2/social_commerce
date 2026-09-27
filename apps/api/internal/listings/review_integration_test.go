//go:build integration

package listings

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
	"github.com/lulupang2/social_commerce/apps/api/internal/httpapi"
	"github.com/lulupang2/social_commerce/apps/api/internal/listingimages"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/orders"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

type reviewSignedStorage struct{ testUnavailableStorage }

func (reviewSignedStorage) Sign(_ context.Context, path string, _ time.Duration) (string, error) {
	return "https://storage.example.invalid/object/sign/listing-images/" + path + "?token=fixture", nil
}

func TestFixtureReviewLifecycle(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" || os.Getenv("DB_TARGET") != "fixture" || os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("isolated fixture required")
	}
	ctx := context.Background()
	pools := map[platform.Role]*pgxpool.Pool{}
	var apiConfig platform.Config
	for _, role := range []platform.Role{platform.API, platform.Migration} {
		cfg, err := platform.LoadConfig(role, "")
		must(t, err)
		pool, err := platform.OpenDatabase(ctx, cfg)
		must(t, err)
		t.Cleanup(pool.Close)
		pools[role] = pool
		if role == platform.API {
			apiConfig = cfg
		}
	}
	admin, api := pools[platform.Migration], pools[platform.API]
	files, err := migrate.LoadFiles("/workspace/supabase/migrations")
	must(t, err)
	logger := platform.NewLogger(io.Discard, "error")
	status, err := migrate.Run(ctx, admin, files, true, logger)
	must(t, err)
	if !status.Ready || status.AppVersion != migrate.PushReceiptsVersion {
		t.Fatal("review migration is not current")
	}
	config, err := auth.ParseConfig(func(key string) string {
		switch key {
		case "APP_ENV":
			return "test"
		case "PUBLIC_WEB_URL":
			return "https://app.example.invalid"
		case "AUTH_DEV_LOGIN_ENABLED":
			return "true"
		}
		return ""
	}, apiConfig)
	must(t, err)
	// The membership is deliberately installed with migrator credentials, never through the API.
	_, err = admin.Exec(ctx, `INSERT INTO summergear_app.members(id,display_name,onboarded) VALUES
 ('00000000-0000-4000-8000-000000000015','Fixture reviewer',true) ON CONFLICT(id) DO NOTHING`)
	must(t, err)
	_, err = admin.Exec(ctx, `INSERT INTO summergear_app.listing_reviewers(member_id) VALUES('00000000-0000-4000-8000-000000000015') ON CONFLICT DO NOTHING`)
	must(t, err)
	app := httpapi.New(logger, nil).App
	t.Cleanup(func() { _ = app.Shutdown() })
	authHandler := auth.Register(app, config, api, logger)
	type client struct {
		cookies []*http.Cookie
		csrf    string
		member  string
	}
	Register(app, api, authHandler, &listingimages.Service{Repo: &listingimages.Store{Pool: api}, Storage: reviewSignedStorage{}}, logger)
	request := func(c *client, method, path string, body []byte, csrf bool) (int, []byte) {
		t.Helper()
		req := httptest.NewRequest(method, config.PublicURL+path, bytes.NewReader(body))
		if c != nil {
			for _, cookie := range c.cookies {
				req.AddCookie(cookie)
			}
		}
		if method != "GET" {
			req.Header.Set("Origin", config.PublicURL)
			if csrf && c != nil {
				req.Header.Set("X-CSRF-Token", c.csrf)
			}
		}
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, e := app.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
		must(t, e)
		data, e := io.ReadAll(resp.Body)
		must(t, e)
		resp.Body.Close()
		if c != nil && len(resp.Cookies()) > 0 {
			c.cookies = resp.Cookies()
		}
		return resp.StatusCode, data
	}
	login := func(role string) *client {
		c := &client{}
		code, data := request(c, "POST", auth.Prefix+"/dev-login", []byte(`{"role":"`+role+`"}`), false)
		if code != 200 {
			t.Fatalf("login %s: %d %s", role, code, data)
		}
		var session auth.SessionView
		must(t, json.Unmarshal(data, &session))
		c.csrf = session.CSRFToken
		c.member = session.Member.ID
		return c
	}
	seller, reviewer, buyer := login("seller_a"), login("reviewer"), login("buyer_b")
	create := []byte(`{"sport":"surf","category":"equipment","title":"Review fixture board","description":"A review lifecycle fixture listing","priceKrw":12000,"condition":"good","location":"fixture","details":{"sport":"surf","equipmentType":"surfboard"}}`)
	code, data := request(seller, "POST", Prefix, create, true)
	if code != 201 {
		t.Fatalf("create: %d %s", code, data)
	}
	var item Listing
	must(t, json.Unmarshal(data, &item))
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.notification_events WHERE kind='listing_review' AND resource_id=$1", item.ID)
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.listing_review_events WHERE listing_id=$1", item.ID)
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.inventory_items WHERE listing_id=$1", item.ID)
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.listings WHERE id=$1", item.ID)
	})
	approve := "/api/v1/reviews/" + item.ID + "/approve"
	reject := "/api/v1/reviews/" + item.ID + "/reject"
	for _, c := range []*client{seller, buyer} {
		if code, _ = request(c, "POST", approve, nil, true); code != 403 {
			t.Fatalf("non reviewer approval: %d", code)
		}
	}
	if code, _ = request(nil, "GET", "/api/v1/reviews", nil, false); code != 401 {
		t.Fatalf("anonymous review queue: %d", code)
	}
	if code, _ = request(reviewer, "POST", approve, nil, false); code != 403 {
		t.Fatalf("missing csrf: %d", code)
	}
	if code, data = request(reviewer, "POST", reject, []byte(`{"reason":"  "}`), true); code != 400 {
		t.Fatalf("empty reason: %d %s", code, data)
	}
	if code, data = request(reviewer, "GET", "/api/v1/reviews", nil, false); code != 200 || !bytes.Contains(data, []byte(item.ID)) {
		t.Fatalf("review queue: %d %s", code, data)
	}
	if code, data = request(reviewer, "POST", reject, []byte(`{"reason":"사진 각도를 보완해 주세요"}`), true); code != 200 {
		t.Fatalf("reject: %d %s", code, data)
	}
	if code, _ = request(reviewer, "POST", approve, nil, true); code != 409 {
		t.Fatalf("stale reviewer approval: %d", code)
	}
	if code, _ = request(buyer, "GET", Prefix+"/"+item.ID+"/reviews", nil, false); code != 404 {
		t.Fatalf("other member saw audit: %d", code)
	}
	if code, data = request(seller, "GET", Prefix+"/"+item.ID+"/reviews", nil, false); code != 200 || !bytes.Contains(data, []byte("사진 각도를")) {
		t.Fatalf("owner review audit: %d %s", code, data)
	}
	if code, _ = request(buyer, "POST", Prefix+"/"+item.ID+"/resubmit", nil, true); code != 404 {
		t.Fatalf("other seller resubmitted: %d", code)
	}
	if code, data = request(seller, "PATCH", Prefix+"/"+item.ID, []byte(`{"title":"Revised board"}`), true); code != 200 {
		t.Fatalf("edit rejected listing: %d %s", code, data)
	}
	if code, data = request(seller, "POST", Prefix+"/"+item.ID+"/resubmit", nil, true); code != 200 {
		t.Fatalf("resubmit: %d %s", code, data)
	}
	if code, data = request(reviewer, "POST", approve, nil, true); code != 200 {
		t.Fatalf("approve: %d %s", code, data)
	}
	if code, _ = request(seller, "PATCH", Prefix+"/"+item.ID, []byte(`{"title":"Illegal live edit"}`), true); code == 200 {
		t.Fatal("active listing edited")
	}
	if code, _ = request(nil, "GET", Prefix+"/"+item.ID, nil, false); code != 200 {
		t.Fatalf("approved listing not public: %d", code)
	}
	if code, data = request(nil, "GET", Prefix+"/"+item.ID+"/availability", nil, false); code != 200 || !bytes.Contains(data, []byte("not_prepared")) {
		t.Fatalf("stock accidentally provisioned: %d %s", code, data)
	}
	if _, err = (&orders.Store{Pool: api}).CreateOrder(ctx, buyer.member, item.ID, 1); err == nil {
		t.Fatal("unprepared listing accepted an order")
	}
	var sellerID string
	must(t, admin.QueryRow(ctx, `INSERT INTO summergear_app.sellers(type,display_name,status) VALUES('individual','Fixture test seller','approved') RETURNING id::text`).Scan(&sellerID))
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.seller_memberships WHERE seller_id=$1", sellerID)
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.sellers WHERE id=$1", sellerID)
	})
	_, err = admin.Exec(ctx, "INSERT INTO summergear_app.seller_memberships(seller_id,member_id,is_owner) VALUES($1,$2,true)", sellerID, seller.member)
	must(t, err)
	_, err = admin.Exec(ctx, "INSERT INTO summergear_app.inventory_items(listing_id,seller_id,available_quantity) VALUES($1,$2,1)", item.ID, sellerID)
	must(t, err)
	if code, data = request(nil, "GET", Prefix+"/"+item.ID+"/availability", nil, false); code != 200 || !bytes.Contains(data, []byte(`"purchasable":true`)) {
		t.Fatalf("prepared listing availability: %d %s", code, data)
	}
	order, err := (&orders.Store{Pool: api}).CreateOrder(ctx, buyer.member, item.ID, 1)
	must(t, err)
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.orders WHERE id=$1", order.ID)
	})
}

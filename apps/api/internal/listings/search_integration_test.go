//go:build integration

package listings

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
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
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func TestCatalogPagesAndFilters(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" || os.Getenv("DB_TARGET") != "fixture" || os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("isolated fixture required")
	}
	ctx := context.Background()
	pools := map[platform.Role]*pgxpool.Pool{}
	var config platform.Config
	for _, role := range []platform.Role{platform.API, platform.Migration} {
		cfg, err := platform.LoadConfig(role, "")
		must(t, err)
		pool, err := platform.OpenDatabase(ctx, cfg)
		must(t, err)
		t.Cleanup(pool.Close)
		pools[role] = pool
		if role == platform.API {
			config = cfg
		}
	}
	admin := pools[platform.Migration]
	files, err := migrate.LoadFiles("/workspace/supabase/migrations")
	must(t, err)
	logger := platform.NewLogger(io.Discard, "error")
	status, err := migrate.Run(ctx, admin, files, true, logger)
	must(t, err)
	if !status.Ready || status.AppVersion != migrate.PushReceiptsVersion {
		t.Fatal("migration not ready")
	}
	var owner string
	must(t, admin.QueryRow(ctx, "INSERT INTO summergear_app.members(display_name,onboarded) VALUES('Catalog fixture',true) RETURNING id::text").Scan(&owner))
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.listings WHERE member_id=$1", owner)
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.members WHERE id=$1", owner)
	})
	for i := range 31 {
		title := fmt.Sprintf("CatalogOnly %02d", i)
		if i == 30 {
			title += " NeedleOutsideFirst24"
		}
		sport := "surf"
		if i%2 == 1 {
			sport = "tennis"
		}
		location := "Busan"
		if i%3 == 0 {
			location = "Yangyang"
		}
		_, err = admin.Exec(ctx, `INSERT INTO summergear_app.listings(member_id,sport,category,title,description,price_krw,condition,status,details,location_text,published_at,created_at)
  VALUES($1,$2,'equipment',$3,'Catalog server page fixture listing', $4,'good','active',jsonb_build_object('sport',$2::text),$5,clock_timestamp(),$6)`, owner, sport, title, 10000+(i%3)*1000, location, time.Now().Add(-time.Duration(i+1)*time.Hour))
		must(t, err)
	}
	_, err = admin.Exec(ctx, `INSERT INTO summergear_app.listings(member_id,sport,category,title,description,price_krw,condition,status,details,location_text)
 VALUES($1,'surf','equipment','CatalogOnly private','Private catalog fixture listing',10000,'good','pending_review','{"sport":"surf"}','Busan')`, owner)
	must(t, err)
	store := &Store{Pool: pools[platform.API]}
	for _, sort := range []string{"recent", "price_asc", "price_desc"} {
		q := PageQuery{Filters: Filters{Search: "CatalogOnly", Sort: sort}, Limit: 24}
		ids := map[string]bool{}
		count := 0
		var previous *Listing
		for {
			page, e := store.ListPage(ctx, q)
			must(t, e)
			if count == 0 && (len(page.Items) != 24 || page.NextCursor == nil) {
				t.Fatalf("first %s page: %d", sort, len(page.Items))
			}
			for _, item := range page.Items {
				if ids[item.ID] || item.Status != "active" {
					t.Fatalf("duplicate/private %s %s", sort, item.ID)
				}
				if previous != nil {
					switch sort {
					case "recent":
						if previous.CreatedAt.Before(item.CreatedAt) || previous.CreatedAt.Equal(item.CreatedAt) && previous.ID <= item.ID {
							t.Fatal("unstable recent order")
						}
					case "price_asc":
						if previous.PriceKRW > item.PriceKRW || previous.PriceKRW == item.PriceKRW && previous.ID >= item.ID {
							t.Fatal("unstable ascending price order")
						}
					case "price_desc":
						if previous.PriceKRW < item.PriceKRW || previous.PriceKRW == item.PriceKRW && previous.ID <= item.ID {
							t.Fatal("unstable descending price order")
						}
					}
				}
				last := item
				previous = &last
				ids[item.ID] = true
				count++
			}
			if page.NextCursor == nil {
				break
			}
			q.Cursor = *page.NextCursor
		}
		if count != 31 {
			t.Fatalf("%s count=%d want 31", sort, count)
		}
	}
	only, e := store.ListPage(ctx, PageQuery{Filters: Filters{Search: "NeedleOutsideFirst24"}})
	must(t, e)
	if len(only.Items) != 1 || only.NextCursor != nil {
		t.Fatal("first 24 boundary search failed")
	}
	min, max := int64(11000), int64(11000)
	filtered, e := store.ListPage(ctx, PageQuery{Filters: Filters{Search: "CatalogOnly", Sport: "surf", Category: "equipment", Location: "Busan", MinPrice: &min, MaxPrice: &max}})
	must(t, e)
	for _, item := range filtered.Items {
		if item.Sport != "surf" || item.PriceKRW != 11000 || item.Location != "Busan" {
			t.Fatalf("wrong server filter: %+v", item)
		}
	}
	page, e := store.ListPage(ctx, PageQuery{Filters: Filters{Search: "CatalogOnly"}, Limit: 2})
	must(t, e)
	if page.NextCursor == nil {
		t.Fatal("cursor missing")
	}
	if _, e = store.ListPage(ctx, PageQuery{Filters: Filters{Search: "Other"}, Limit: 2, Cursor: *page.NextCursor}); e != errInvalid {
		t.Fatalf("cursor reused with other filter: %v", e)
	}
	authConfig, e := auth.ParseConfig(func(k string) string {
		if k == "PUBLIC_WEB_URL" {
			return "https://app.example.invalid"
		}
		return ""
	}, config)
	must(t, e)
	app := httpapi.New(logger, nil).App
	t.Cleanup(func() { _ = app.Shutdown() })
	handler := auth.Register(app, authConfig, pools[platform.API], logger)
	Register(app, pools[platform.API], handler, &listingimages.Service{Repo: &listingimages.Store{Pool: pools[platform.API]}, Storage: testUnavailableStorage{}}, logger)
	get := func(path string) (int, []byte) {
		req := httptest.NewRequest("GET", authConfig.PublicURL+path, nil)
		resp, e := app.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
		must(t, e)
		data, e := io.ReadAll(resp.Body)
		must(t, e)
		resp.Body.Close()
		return resp.StatusCode, data
	}
	code, data := get(Prefix + "?search=NeedleOutsideFirst24")
	if code != 200 {
		t.Fatalf("HTTP beyond first page: %d %s", code, data)
	}
	var response ListingPage
	must(t, json.Unmarshal(data, &response))
	if len(response.Items) != 1 {
		t.Fatalf("HTTP search items=%d", len(response.Items))
	}
	for _, path := range []string{"?minPrice=-1", "?minPrice=300&maxPrice=100", "?sort=random", "?limit=51", "?search=a&search=b", "?cursor=garbage"} {
		if code, _ = get(Prefix + path); code != 400 {
			t.Fatalf("invalid query %s accepted: %d", path, code)
		}
	}
}

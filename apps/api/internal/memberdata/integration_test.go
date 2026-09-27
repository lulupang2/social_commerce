//go:build integration

package memberdata

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
	"github.com/lulupang2/social_commerce/apps/api/internal/httpapi"
	"github.com/lulupang2/social_commerce/apps/api/internal/listingimages"
	"github.com/lulupang2/social_commerce/apps/api/internal/listings"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

type noImages struct{}

func (noImages) List(context.Context, string, string) ([]listingimages.View, error) {
	return []listingimages.View{}, nil
}
func check(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
func TestMemberDataIsolation(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" || os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("isolated fixture required")
	}
	ctx := context.Background()
	pools := map[platform.Role]*pgxpool.Pool{}
	for _, role := range []platform.Role{platform.API, platform.Migration} {
		cfg, err := platform.LoadConfig(role, "")
		check(t, err)
		pool, err := platform.OpenDatabase(ctx, cfg)
		check(t, err)
		pools[role] = pool
		t.Cleanup(pool.Close)
	}
	files, err := migrate.LoadFiles("/workspace/supabase/migrations")
	check(t, err)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	status, err := migrate.Run(ctx, pools[platform.Migration], files, true, logger)
	check(t, err)
	if status.AppVersion != migrate.PushReceiptsVersion || !status.Ready {
		t.Fatal("member migration not ready")
	}
	api := pools[platform.API]
	cfg, err := platform.LoadConfig(platform.API, "")
	check(t, err)
	authCfg, err := auth.ParseConfig(func(key string) string {
		switch key {
		case "APP_ENV":
			return "test"
		case "AUTH_DEV_LOGIN_ENABLED":
			return "true"
		case "PUBLIC_WEB_URL":
			return "https://app.example.invalid"
		}
		return ""
	}, cfg)
	check(t, err)
	if !authCfg.FixtureRoles {
		t.Fatal("fixture roles not guarded and enabled")
	}
	app := httpapi.New(logger, func(context.Context) error { return nil }).App
	ah := auth.Register(app, authCfg, api, logger)
	listings.Register(app, api, ah, noImages{}, logger)
	Register(app, api, ah, noImages{}, logger)
	type actor struct {
		cookies  map[string]string
		csrf, id string
	}
	send := func(who *actor, method, path, body, csrf string) (int, []byte) {
		t.Helper()
		req := httptest.NewRequest(method, authCfg.PublicURL+path, strings.NewReader(body))
		req.Header.Set("Origin", authCfg.PublicURL)
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		if csrf != "" {
			req.Header.Set("X-CSRF-Token", csrf)
		}
		if who != nil {
			for key, value := range who.cookies {
				req.AddCookie(&http.Cookie{Name: key, Value: value})
			}
		}
		resp, err := app.Test(req, fiber.TestConfig{Timeout: 20 * time.Second})
		check(t, err)
		defer resp.Body.Close()
		data, err := io.ReadAll(resp.Body)
		check(t, err)
		if who != nil {
			for _, cookie := range resp.Cookies() {
				if cookie.MaxAge < 0 {
					delete(who.cookies, cookie.Name)
				} else {
					who.cookies[cookie.Name] = cookie.Value
				}
			}
		}
		return resp.StatusCode, data
	}
	login := func(role string) *actor {
		a := &actor{cookies: map[string]string{}}
		code, data := send(a, "POST", auth.Prefix+"/dev-login", `{"role":"`+role+`"}`, "")
		if code != 200 {
			t.Fatalf("fixture login %s: %d %s", role, code, data)
		}
		var view auth.SessionView
		check(t, json.Unmarshal(data, &view))
		a.csrf = view.CSRFToken
		a.id = view.Member.ID
		return a
	}
	buyerA, buyerB, sellerA, sellerB := login("buyer_a"), login("buyer_b"), login("seller_a"), login("seller_b")
	if buyerA.id == buyerB.id || sellerA.id == sellerB.id || buyerA.id == sellerA.id {
		t.Fatal("fixture roles shared a member")
	}
	code, _ := send(nil, "GET", Prefix, "", "")
	if code != 401 {
		t.Fatal("anonymous profile readable")
	}
	code, _ = send(buyerA, "PUT", Prefix, `{"displayName":"Buyer A","surfSkill":"expert","tennisSkill":"beginner","preferredSport":"surf","maxBudgetKrw":200000,"preferredRegion":"Yangyang"}`, "")
	if code != 403 {
		t.Fatal("missing CSRF accepted")
	}
	code, _ = send(buyerA, "PUT", Prefix, `{"displayName":"Buyer A","surfSkill":"expert","tennisSkill":"beginner","preferredSport":"surf","maxBudgetKrw":200000,"preferredRegion":"Yangyang"}`, buyerA.csrf)
	if code != 200 {
		t.Fatalf("profile update: %d", code)
	}
	code, data := send(buyerB, "GET", Prefix, "", "")
	if code != 200 || strings.Contains(string(data), "Buyer A") || strings.Contains(string(data), "Yangyang") {
		t.Fatal("buyer A profile leaked to B")
	}
	code, data = send(buyerA, "GET", Prefix, "", "")
	if code != 200 || !strings.Contains(string(data), "Buyer A") || !strings.Contains(string(data), `"preferredRegion":"Yangyang"`) {
		t.Fatal("buyer A profile not persisted")
	}
	listingBody := `{"sport":"surf","category":"equipment","title":"판매자 A 매물","description":"회원별 접근 검증을 위한 매물입니다.","priceKrw":25000,"condition":"good","location":"서울","details":{"sport":"surf","equipmentType":"surfboard","discipline":"shortboard","boardLengthFeet":6,"volumeLiters":30,"finSystem":"fcs2"}}`
	code, data = send(sellerA, "POST", listings.Prefix, listingBody, sellerA.csrf)
	if code != 201 {
		t.Fatalf("create: %d %s", code, data)
	}
	var listing listings.Listing
	check(t, json.Unmarshal(data, &listing))
	code, data = send(sellerA, "GET", Prefix+"/listings", "", "")
	if code != 200 || !strings.Contains(string(data), listing.ID) {
		t.Fatal("seller A cannot see pending listing")
	}
	code, data = send(sellerB, "GET", Prefix+"/listings", "", "")
	if code != 200 || strings.Contains(string(data), listing.ID) {
		t.Fatal("seller A pending listing leaked to B")
	}
	code, _ = send(buyerA, "PUT", Prefix+"/favorites/"+listing.ID, "", buyerA.csrf)
	if code != 404 {
		t.Fatal("pending listing saved by buyer")
	}
	_, err = pools[platform.Migration].Exec(ctx, "UPDATE summergear_app.listings SET status='active',published_at=clock_timestamp() WHERE id=$1", listing.ID)
	check(t, err)
	code, _ = send(buyerA, "PUT", Prefix+"/favorites/"+listing.ID, "", "")
	if code != 403 {
		t.Fatal("favorite accepted without CSRF token")
	}
	code, _ = send(buyerA, "PUT", Prefix+"/favorites/"+listing.ID, "", buyerA.csrf)
	if code != 200 {
		t.Fatalf("favorite insert: %d", code)
	}
	code, data = send(buyerA, "GET", Prefix+"/favorites", "", "")
	if code != 200 || !strings.Contains(string(data), listing.ID) {
		t.Fatal("favorite missing after GET")
	}
	code, data = send(buyerB, "GET", Prefix+"/favorites", "", "")
	if code != 200 || strings.Contains(string(data), listing.ID) {
		t.Fatal("buyer A favorites leaked to B")
	}
	code, _ = send(buyerB, "DELETE", Prefix+"/favorites/"+listing.ID, "", buyerB.csrf)
	if code != 200 {
		t.Fatal("buyer B cannot change own empty favorite state")
	}
	code, data = send(buyerA, "GET", Prefix+"/favorites", "", "")
	if code != 200 || !strings.Contains(string(data), listing.ID) {
		t.Fatal("buyer B altered buyer A favorite")
	}
	code, _ = send(buyerA, "POST", auth.Prefix+"/logout", "", buyerA.csrf)
	if code != 204 {
		t.Fatal("logout failed")
	}
	code, _ = send(buyerA, "GET", Prefix+"/favorites", "", "")
	if code != 401 {
		t.Fatal("logged-out member still reads favorites")
	}
	buyerA = login("buyer_a")
	code, data = send(buyerA, "GET", Prefix, "", "")
	if code != 200 || !strings.Contains(string(data), "Buyer A") || !strings.Contains(string(data), `"savedCount":1`) || !strings.Contains(string(data), `"preferredRegion":"Yangyang"`) {
		t.Fatalf("profile and saved count not restored after re-login: %d %s", code, data)
	}
	code, data = send(buyerA, "GET", Prefix+"/favorites", "", "")
	if code != 200 || !strings.Contains(string(data), listing.ID) {
		t.Fatal("favorite not restored after re-login")
	}
	code, _ = send(buyerA, "DELETE", Prefix+"/favorites/"+listing.ID, "", buyerA.csrf)
	if code != 200 {
		t.Fatal("favorite removal failed")
	}
	code, data = send(buyerA, "GET", Prefix+"/favorites", "", "")
	if code != 200 || strings.Contains(string(data), listing.ID) {
		t.Fatal("favorite removal not persisted")
	}
	code, _ = send(buyerA, "POST", auth.Prefix+"/logout", "", buyerA.csrf)
	if code != 204 {
		t.Fatal("logout failed")
	}
	code, _ = send(buyerA, "GET", Prefix, "", "")
	if code != 401 {
		t.Fatal("logged-out member still reads profile")
	}
}

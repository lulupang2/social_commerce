//go:build integration && authfixture

package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func TestAuthMigrationAndAccounts(t *testing.T) {
	pools := authPools(t)
	ctx := context.Background()
	admin := pools[platform.Migration]
	files := appFiles(t)
	logger := platform.NewLogger(io.Discard, "error")
	t.Run("ordered_migrations_checksums_and_history", func(t *testing.T) {
		if _, err := migrate.Run(ctx, admin, []migrate.File{files[1], files[0]}, true, logger); err == nil {
			t.Fatal("reordered migration accepted")
		}
		for range 2 {
			status, err := migrate.Run(ctx, admin, files, true, logger)
			require(t, err)
			if status.AppVersion != migrate.ListingsVersion || !status.Ready {
				t.Fatal("auth migration incomplete")
			}
		}
		drift := append([]migrate.File{}, files...)
		drift[1].SQL = append(append([]byte{}, drift[1].SQL...), []byte("\n-- drift\n")...)
		if _, err := migrate.Run(ctx, admin, drift, true, logger); err == nil {
			t.Fatal("applied auth checksum change accepted")
		}
		var original string
		require(t, admin.QueryRow(ctx, `DELETE FROM summergear_meta.schema_migrations WHERE version=$1 RETURNING checksum`, migrate.AppVersion).Scan(&original))
		_, gapErr := migrate.Run(ctx, admin, files, false, logger)
		_, err := admin.Exec(ctx, `INSERT INTO summergear_meta.schema_migrations(version,checksum) VALUES($1,$2)`, migrate.AppVersion, original)
		require(t, err)
		if gapErr == nil {
			t.Fatal("history gap accepted")
		}
		_, err = admin.Exec(ctx, `INSERT INTO summergear_meta.schema_migrations(version,checksum) VALUES('9999_unexpected','fixture')`)
		require(t, err)
		_, unknownErr := migrate.Run(ctx, admin, files, false, logger)
		_, err = admin.Exec(ctx, `DELETE FROM summergear_meta.schema_migrations WHERE version='9999_unexpected'`)
		require(t, err)
		if unknownErr == nil {
			t.Fatal("unknown history accepted")
		}
	})
	h := newHarness(t, pools)
	t.Run("explicit_dev_login_uses_real_session_without_social_identity", func(t *testing.T) {
		cookies := map[string]string{}
		resp, data := h.request(t, "POST", Prefix+"/dev-login", cookies, "", map[string]string{"Origin": h.cfg.PublicURL})
		if resp.StatusCode != 200 {
			t.Fatalf("dev login returned %d", resp.StatusCode)
		}
		var view SessionView
		require(t, json.Unmarshal(data, &view))
		if view.Member.ID != devMemberID || !view.Member.Onboarded || view.CSRFToken == "" {
			t.Fatal("dev login did not return the expected test member session")
		}
		token := cookies[h.cfg.SessionCookie()]
		if !validToken(token) {
			t.Fatal("dev login did not set a service session cookie")
		}
		stored, err := h.handler.Store.Session(ctx, token)
		require(t, err)
		if stored.Member.ID != devMemberID {
			t.Fatal("dev login cookie is not backed by auth_sessions")
		}
		var identities int
		require(t, admin.QueryRow(ctx, `SELECT count(*) FROM summergear_app.auth_identities WHERE member_id=$1`, devMemberID).Scan(&identities))
		if identities != 0 {
			t.Fatal("dev login created a fake social identity")
		}
	})
	t.Run("worker_and_browser_auth_denied", func(t *testing.T) {
		for _, table := range []string{"members", "auth_identities", "auth_sessions", "auth_login_transactions"} {
			_, err := h.worker.Exec(ctx, "SELECT * FROM summergear_app."+table+" LIMIT 0")
			var pgErr *pgconn.PgError
			if !errors.As(err, &pgErr) || pgErr.Code != "42501" {
				t.Fatal("worker can access auth data")
			}
			for _, role := range []string{"anon", "authenticated"} {
				var allowed bool
				require(t, admin.QueryRow(ctx, `SELECT has_table_privilege($1,$2,'SELECT')`, role, "summergear_app."+table).Scan(&allowed))
				if allowed {
					t.Fatal("browser role can access auth data")
				}
			}
		}
		if _, err := h.api.Exec(ctx, `UPDATE summergear_app.members SET status='active' WHERE false`); err == nil {
			t.Fatal("API unexpectedly can change member status")
		}
	})
	t.Run("both_providers_new_existing_no_email_no_auto_merge", func(t *testing.T) {
		ids := map[string]string{}
		for _, name := range []string{"naver", "kakao"} {
			h.fixture.SetMode("")
			cookies := map[string]string{}
			first := h.login(t, name, "accounts-"+name, cookies)
			second := h.login(t, name, "accounts-"+name, map[string]string{})
			if first.Member.ID != second.Member.ID || first.Member.Onboarded {
				t.Fatal("existing identity duplicated or onboarding bypassed")
			}
			ids[name] = first.Member.ID
			h.fixture.SetMode("no-email")
			empty := h.login(t, name, "no-email-"+name, map[string]string{})
			if empty.Member.Email != nil {
				t.Fatal("absent email replaced with invented value")
			}
		}
		if ids["naver"] == ids["kakao"] {
			t.Fatal("same email auto-merged different providers")
		}
	})
	t.Run("concurrent_first_login_creates_one_member", func(t *testing.T) {
		h.fixture.SetMode("")
		h.fixture.SetSubject("naver", "concurrent-first")
		var before int
		require(t, admin.QueryRow(ctx, `SELECT count(*) FROM summergear_app.members`).Scan(&before))
		requests := make([]*http.Request, 4)
		for i := range requests {
			cookies := map[string]string{}
			path := h.start(t, "naver", cookies)
			req := httptest.NewRequest("GET", h.cfg.PublicURL+path, nil)
			for k, v := range cookies {
				req.AddCookie(&http.Cookie{Name: k, Value: v})
			}
			requests[i] = req
		}
		var wg sync.WaitGroup
		ids := make(chan string, 4)
		errs := make(chan error, 4)
		for _, req := range requests {
			wg.Add(1)
			go func(req *http.Request) {
				defer wg.Done()
				resp, err := h.app.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
				if err != nil {
					errs <- fmt.Errorf("callback request failed")
					return
				}
				defer resp.Body.Close()
				if resp.StatusCode != 303 || resp.Header.Get("Location") != TestPath+"?auth=success" {
					errs <- fmt.Errorf("concurrent callback did not succeed")
					return
				}
				var token string
				for _, cookie := range resp.Cookies() {
					if cookie.Name == h.cfg.SessionCookie() {
						token = cookie.Value
					}
				}
				view, err := h.handler.Store.Session(ctx, token)
				if err != nil {
					errs <- err
					return
				}
				ids <- view.Member.ID
			}(req)
		}
		wg.Wait()
		close(ids)
		close(errs)
		for err := range errs {
			require(t, err)
		}
		found := ""
		n := 0
		for id := range ids {
			n++
			if found != "" && found != id {
				t.Fatal("duplicate internal member")
			}
			found = id
		}
		if n != 4 {
			t.Fatal("missing concurrent result")
		}
		var after int
		require(t, admin.QueryRow(ctx, `SELECT count(*) FROM summergear_app.members`).Scan(&after))
		if after != before+1 {
			t.Fatal("concurrent account creation left orphan members")
		}
	})
	t.Run("tokens_hash_only_and_no_log_leak", func(t *testing.T) {
		h.fixture.SetMode("")
		cookies := map[string]string{}
		path := h.start(t, "kakao", cookies)
		binding := cookies[h.cfg.LoginCookie()]
		h.finish(t, path, cookies)
		token := cookies[h.cfg.SessionCookie()]
		var stored string
		require(t, admin.QueryRow(ctx, `SELECT token_hash FROM summergear_app.auth_sessions WHERE token_hash=$1`, hashToken(token)).Scan(&stored))
		if stored == token || len(stored) != 64 {
			t.Fatal("session raw token stored")
		}
		if strings.Contains(h.logs.String(), token) || strings.Contains(h.logs.String(), binding) || strings.Contains(h.logs.String(), "fixture-secret-") {
			t.Fatal("secret leaked into logs")
		}
		var remaining int
		require(t, admin.QueryRow(ctx, `SELECT count(*) FROM summergear_app.auth_login_transactions WHERE consumed_at IS NOT NULL AND (pkce_verifier IS NOT NULL OR nonce IS NOT NULL)`).Scan(&remaining))
		if remaining != 0 {
			t.Fatal("consumed login secrets retained")
		}
	})
}

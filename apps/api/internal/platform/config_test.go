package platform

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fixtureValues() map[string]string {
	return map[string]string{"APP_ENV": "test", "DB_TARGET": "fixture", "DB_TARGET_ID": FixtureID,
		"DATABASE_URL":           "postgres://summergear_api:fixture_api@postgres:5432/summergear_foundation_test?sslmode=disable",
		"RIVER_DATABASE_URL":     "postgres://summergear_worker:fixture_worker@postgres:5432/summergear_foundation_test?sslmode=disable",
		"MIGRATION_DATABASE_URL": "postgres://summergear_migrator:fixture_migrator@postgres:5432/summergear_foundation_test?sslmode=disable"}
}

func TestConfigGuards(t *testing.T) {
	for _, role := range []Role{API, Worker, Migration} {
		t.Run(string(role), func(t *testing.T) {
			values := fixtureValues()
			c, err := ParseConfig(role, func(k string) string { return values[k] })
			if err != nil || c.Role != role {
				t.Fatalf("valid fixture config rejected: %v", err)
			}
		})
	}
	cases := []struct {
		name, key, value string
		role             Role
	}{
		{"production", "APP_ENV", "production", API},
		{"live_payment", "PAYMENT_MODE", "live", API},
		{"missing_dsn", "DATABASE_URL", "", API},
		{"missing_target", "DB_TARGET", "", API},
		{"wrong_marker", "DB_TARGET_ID", "other-target", API},
		{"worker_transaction", "RIVER_CONNECTION_MODE", "transaction", Worker},
		{"worker_pooler_port", "RIVER_DATABASE_URL", "postgres://summergear_worker:DO_NOT_LEAK@postgres:6543/summergear_foundation_test?sslmode=disable", Worker},
		{"wrong_role", "DATABASE_URL", "postgres://postgres:DO_NOT_LEAK@postgres:5432/summergear_foundation_test?sslmode=disable", API},
		{"external_fixture", "DATABASE_URL", "postgres://summergear_api:DO_NOT_LEAK@db.example.com:5432/summergear_foundation_test?sslmode=disable", API},
		{"query_override", "DATABASE_URL", "postgres://summergear_api:DO_NOT_LEAK@postgres:5432/summergear_foundation_test?sslmode=disable&host=evil", API},
		{"workers_bound", "RIVER_MAX_WORKERS", "100", Worker},
		{"pool_reserve", "WORKER_DB_MAX_CONNS", "2", Worker},
		{"duration", "SHUTDOWN_TIMEOUT", "invalid", API},
		{"level", "LOG_LEVEL", "invalid", API},
		{"address", "API_ADDR", "invalid", API},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			values := fixtureValues()
			values[tc.key] = tc.value
			_, err := ParseConfig(tc.role, func(k string) string { return values[k] })
			if err == nil {
				t.Fatal("unsafe config accepted")
			}
			if strings.Contains(err.Error(), "DO_NOT_LEAK") {
				t.Fatal("secret leaked")
			}
		})
	}
}

func TestHostedTLSAndFixtureControls(t *testing.T) {
	values := fixtureValues()
	values["DB_TARGET"] = "supabase-test"
	values["DB_TARGET_ID"] = "dedicated-test-project-2026"
	values["DATABASE_URL"] = "postgres://summergear_api:secret@db.project.supabase.co:5432/postgres?sslmode=verify-full"
	if _, err := ParseConfig(API, func(k string) string { return values[k] }); err != nil {
		t.Fatal(err)
	}
	values["FIXTURE_FAST_JOBS"] = "true"
	if _, err := ParseConfig(API, func(k string) string { return values[k] }); err == nil {
		t.Fatal("fixture switch accepted externally")
	}
	delete(values, "FIXTURE_FAST_JOBS")
	values["DATABASE_URL"] = strings.Replace(values["DATABASE_URL"], "verify-full", "require", 1)
	if _, err := ParseConfig(API, func(k string) string { return values[k] }); err == nil {
		t.Fatal("unverified TLS accepted")
	}
}

func TestPrivateLiteralEnvFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.env")
	if err := os.WriteFile(path, []byte("# comment\nKEY='$(touch /tmp/should-not-execute)'\nOTHER=literal=value\n"), 0600); err != nil {
		t.Fatal(err)
	}
	values, err := ReadEnvFile(path)
	if err != nil || values["KEY"] != "$(touch /tmp/should-not-execute)" || values["OTHER"] != "literal=value" {
		t.Fatal("literal parsing failed")
	}
	if err = os.Chmod(path, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err = ReadEnvFile(path); err == nil {
		t.Fatal("public env file accepted")
	}
	os.Chmod(path, 0600)
	os.WriteFile(path, []byte("KEY=one\nKEY=two\n"), 0600)
	if _, err = ReadEnvFile(path); err == nil {
		t.Fatal("duplicate env accepted")
	}
}

func TestEnvPrecedenceAndOwnCredential(t *testing.T) {
	values := fixtureValues()
	var contents strings.Builder
	for k, v := range values {
		contents.WriteString(k + "=" + v + "\n")
	}
	path := filepath.Join(t.TempDir(), "test.env")
	os.WriteFile(path, []byte(contents.String()), 0600)
	t.Setenv("DATABASE_URL", values["DATABASE_URL"])
	t.Setenv("APP_ENV", "test")
	t.Setenv("DB_TARGET", "fixture")
	t.Setenv("DB_TARGET_ID", FixtureID)
	cfg, err := LoadConfig(API, path)
	if err != nil || cfg.DatabaseURL != values["DATABASE_URL"] {
		t.Fatal("API config failed")
	}
	t.Setenv("DATABASE_URL", "")
	if _, err := LoadConfig(API, path); err == nil {
		t.Fatal("empty override did not override file")
	}
}

func TestLogRedaction(t *testing.T) {
	var b bytes.Buffer
	logger := NewLogger(&b, "debug")
	logger.Error("failed", "error", errors.New("password=DO_NOT_LEAK"), "dsn", "DO_NOT_LEAK", "payload", "DO_NOT_LEAK", "detail", "postgres://u:DO_NOT_LEAK@host/db")
	if strings.Contains(b.String(), "DO_NOT_LEAK") || !strings.Contains(b.String(), "redacted") {
		t.Fatal("log redaction failed")
	}
}

func TestListingImageStorageConfig(t *testing.T) {
	values := fixtureValues()
	cfg, err := ParseConfig(API, func(k string) string { return values[k] })
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ListingImageBucket != "listing-images" || cfg.ListingImageSignedURLTTL != 600*time.Second ||
		cfg.SupabaseURL != "" || cfg.SupabaseServiceRoleKey != "" {
		t.Fatal("unsafe or unexpected listing image defaults")
	}

	values["SUPABASE_URL"] = "https://fixture.supabase.co"
	values["SUPABASE_SERVICE_ROLE_KEY"] = "DO_NOT_LEAK"
	values["LISTING_IMAGE_BUCKET"] = "listing-images"
	values["LISTING_IMAGE_SIGNED_URL_TTL_SECONDS"] = "600"
	cfg, err = ParseConfig(API, func(k string) string { return values[k] })
	if err != nil || cfg.SupabaseURL == "" || cfg.SupabaseServiceRoleKey == "" ||
		cfg.ListingImageSignedURLTTL != 600*time.Second {
		t.Fatalf("valid image storage config rejected: %v", err)
	}

	cases := []map[string]string{
		{"SUPABASE_URL": "https://fixture.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": ""},
		{"SUPABASE_URL": "", "SUPABASE_SERVICE_ROLE_KEY": "DO_NOT_LEAK"},
		{"SUPABASE_URL": "http://storage.example.com", "SUPABASE_SERVICE_ROLE_KEY": "DO_NOT_LEAK"},
		{"SUPABASE_URL": "https://fixture.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "DO_NOT_LEAK", "LISTING_IMAGE_BUCKET": "public-images"},
		{"SUPABASE_URL": "https://fixture.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "DO_NOT_LEAK", "LISTING_IMAGE_SIGNED_URL_TTL_SECONDS": "601"},
	}
	for i, overrides := range cases {
		bad := fixtureValues()
		for key, value := range overrides {
			bad[key] = value
		}
		_, err := ParseConfig(API, func(k string) string { return bad[k] })
		if err == nil {
			t.Fatalf("unsafe image storage config %d accepted", i)
		}
		if strings.Contains(err.Error(), "DO_NOT_LEAK") {
			t.Fatal("service-role secret leaked in config error")
		}
	}
}

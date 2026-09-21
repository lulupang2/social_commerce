package platform

import (
	"bufio"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Role string

const (
	API         Role = "api"
	Worker      Role = "worker"
	Migration   Role = "migration"
	AppSchema        = "summergear_app"
	RiverSchema      = "summergear_river"
	MetaSchema       = "summergear_meta"
	FixtureID        = "summergear-foundation-fixture-v1"
)

// Config contains only settings used by this process, never credentials for
// unrelated roles. Do not serialize Config. Errors expose setting names, never values.
type Config struct {
	Role                     Role
	DatabaseURL              string
	Target                   string
	TargetID                 string
	Address                  string
	ConnectionMode           string
	MaxConns                 int32
	MaxWorkers               int
	LogLevel                 string
	ShutdownTimeout          time.Duration
	FixtureFast              bool
	SupabaseURL              string
	SupabaseServiceRoleKey   string
	ListingImageBucket       string
	ListingImageSignedURLTTL time.Duration
}

var envKey = regexp.MustCompile(`^[A-Z][A-Z0-9_]*$`)

// ReadEnvFile parses literal KEY=value entries; it never invokes a shell or
// expands variables. Environment variables override file entries, including empty ones.
func ReadEnvFile(path string) (map[string]string, error) {
	values := map[string]string{}
	if path == "" {
		return values, nil
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 {
		return nil, errors.New("env file must be a readable regular file with private permissions (0600)")
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, errors.New("env file cannot be opened")
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		key, value = strings.TrimSpace(key), strings.TrimSpace(value)
		if !ok || !envKey.MatchString(key) {
			return nil, errors.New("invalid env file entry; use literal KEY=value")
		}
		if _, exists := values[key]; exists {
			return nil, fmt.Errorf("duplicate setting: %s", key)
		}
		if strings.HasPrefix(value, `"`) || strings.HasPrefix(value, `'`) {
			if len(value) < 2 || value[len(value)-1] != value[0] {
				return nil, fmt.Errorf("invalid quoting: %s", key)
			}
			value = value[1 : len(value)-1]
		}
		values[key] = value
	}
	if scanner.Err() != nil {
		return nil, errors.New("env file cannot be parsed")
	}
	return values, nil
}

func LoadConfig(role Role, envFile string) (Config, error) {
	values, err := ReadEnvFile(envFile)
	if err != nil {
		return Config{}, err
	}
	get := func(key string) string {
		if value, exists := os.LookupEnv(key); exists {
			return value
		}
		return values[key]
	}
	return ParseConfig(role, get)
}

func ParseConfig(role Role, get func(string) string) (Config, error) {
	c := Config{Role: role, Address: "127.0.0.1:8080", MaxWorkers: 1, LogLevel: "info", ShutdownTimeout: 10 * time.Second}
	if get("APP_ENV") != "test" {
		return c, errors.New("APP_ENV must be test; production is not enabled")
	}
	if value := get("PAYMENT_MODE"); value != "" && value != "test" {
		return c, errors.New("PAYMENT_MODE must be test")
	}
	c.Target, c.TargetID = get("DB_TARGET"), get("DB_TARGET_ID")
	if c.Target != "fixture" && c.Target != "supabase-test" {
		return c, errors.New("DB_TARGET must explicitly select fixture or supabase-test")
	}
	if c.TargetID == "" {
		return c, errors.New("missing setting: DB_TARGET_ID")
	}
	if c.Target == "fixture" && c.TargetID != FixtureID {
		return c, errors.New("DB_TARGET_ID is not the isolated fixture identity")
	}
	if c.Target == "supabase-test" && (c.TargetID == FixtureID || len(c.TargetID) < 16) {
		return c, errors.New("DB_TARGET_ID must uniquely identify the provisioned Supabase test database")
	}
	key, poolKey := "", ""
	switch role {
	case API:
		key, poolKey, c.MaxConns = "DATABASE_URL", "API_DB_MAX_CONNS", 2
		c.ConnectionMode = get("DATABASE_CONNECTION_MODE")
	case Worker:
		key, poolKey, c.MaxConns = "RIVER_DATABASE_URL", "WORKER_DB_MAX_CONNS", 5
		c.ConnectionMode = get("RIVER_CONNECTION_MODE")
	case Migration:
		key, poolKey, c.MaxConns = "MIGRATION_DATABASE_URL", "MIGRATION_DB_MAX_CONNS", 3
		c.ConnectionMode = "direct"
	default:
		return c, errors.New("unknown process role")
	}
	if c.ConnectionMode == "" {
		c.ConnectionMode = "direct"
	}
	if c.ConnectionMode != "direct" && c.ConnectionMode != "session" && !(role == API && c.ConnectionMode == "transaction") {
		return c, errors.New("connection mode must be direct or session (transaction is API-only)")
	}
	c.DatabaseURL = get(key)
	if c.DatabaseURL == "" {
		return c, fmt.Errorf("missing setting: %s", key)
	}
	if err := validateDSN(c, key); err != nil {
		return c, err
	}
	if value := get(poolKey); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 2 || n > 8 {
			return c, fmt.Errorf("%s must be an integer from 2 to 8", poolKey)
		}
		c.MaxConns = int32(n)
	}
	if role == Worker && c.MaxConns < 4 {
		return c, errors.New("WORKER_DB_MAX_CONNS must be at least 4 for coordinator and work")
	}
	if role == Migration && c.MaxConns < 3 {
		return c, errors.New("MIGRATION_DB_MAX_CONNS must be at least 3 for the migration lock")
	}
	if value := get("RIVER_MAX_WORKERS"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 1 || n > 4 {
			return c, errors.New("RIVER_MAX_WORKERS must be an integer from 1 to 4")
		}
		c.MaxWorkers = n
	}
	if role == Worker && int(c.MaxConns) < c.MaxWorkers+3 {
		return c, errors.New("WORKER_DB_MAX_CONNS must reserve 3 coordinator connections beyond workers")
	}
	if role == API {
		c.ListingImageBucket = "listing-images"
		c.ListingImageSignedURLTTL = 600 * time.Second
		c.SupabaseURL = strings.TrimSpace(get("SUPABASE_URL"))
		c.SupabaseServiceRoleKey = get("SUPABASE_SERVICE_ROLE_KEY")
		if (c.SupabaseURL == "") != (c.SupabaseServiceRoleKey == "") {
			return c, errors.New("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together")
		}
		if c.SupabaseURL != "" {
			if err := validateStorageURL(c.SupabaseURL); err != nil {
				return c, err
			}
		}
		if value := strings.TrimSpace(get("LISTING_IMAGE_BUCKET")); value != "" {
			if value != "listing-images" {
				return c, errors.New("LISTING_IMAGE_BUCKET must be listing-images")
			}
			c.ListingImageBucket = value
		}
		if value := strings.TrimSpace(get("LISTING_IMAGE_SIGNED_URL_TTL_SECONDS")); value != "" {
			seconds, err := strconv.Atoi(value)
			if err != nil || seconds < 1 || seconds > 600 {
				return c, errors.New("LISTING_IMAGE_SIGNED_URL_TTL_SECONDS must be an integer from 1 to 600")
			}
			c.ListingImageSignedURLTTL = time.Duration(seconds) * time.Second
		}
	}
	if value := get("API_ADDR"); value != "" {
		c.Address = value
	}
	if _, _, err := net.SplitHostPort(c.Address); err != nil {
		return c, errors.New("API_ADDR must be host:port")
	}
	if value := get("LOG_LEVEL"); value != "" {
		c.LogLevel = value
	}
	if c.LogLevel != "debug" && c.LogLevel != "info" && c.LogLevel != "warn" && c.LogLevel != "error" {
		return c, errors.New("invalid LOG_LEVEL")
	}
	if value := get("SHUTDOWN_TIMEOUT"); value != "" {
		parsed, err := time.ParseDuration(value)
		c.ShutdownTimeout = parsed
		if err != nil || c.ShutdownTimeout < time.Second || c.ShutdownTimeout > time.Minute {
			return c, errors.New("SHUTDOWN_TIMEOUT must be between 1s and 1m")
		}
	}
	if value := get("FIXTURE_FAST_JOBS"); value != "" && value != "false" {
		if value != "true" || c.Target != "fixture" {
			return c, errors.New("FIXTURE_FAST_JOBS is restricted to the disposable fixture")
		}
		c.FixtureFast = true
	}
	return c, nil
}

func ExpectedRole(role Role) string {
	if role == Migration {
		return "summergear_migrator"
	}
	return "summergear_" + string(role)
}

func validateStorageURL(value string) error {
	u, err := url.Parse(value)
	if err != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return errors.New("invalid SUPABASE_URL")
	}
	if u.Scheme == "https" {
		return nil
	}
	if u.Scheme == "http" {
		host := u.Hostname()
		if host == "localhost" {
			return nil
		}
		if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
			return nil
		}
	}
	return errors.New("SUPABASE_URL must use HTTPS")
}

func validateDSN(c Config, key string) error {
	invalid := func() error {
		return fmt.Errorf("invalid or unsafe %s; check target, role, database and TLS without logging its value", key)
	}
	u, err := url.Parse(c.DatabaseURL)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || u.Hostname() == "" || u.User == nil || u.Fragment != "" {
		return invalid()
	}
	if strings.Split(u.User.Username(), ".")[0] != ExpectedRole(c.Role) {
		return invalid()
	}
	if password, ok := u.User.Password(); !ok || password == "" {
		return invalid()
	}
	query, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		return invalid()
	}
	for key, vals := range query {
		if len(vals) != 1 {
			return invalid()
		}
		switch key {
		case "sslmode", "sslrootcert", "connect_timeout":
		default:
			return invalid()
		}
	}
	if c.Role != API && u.Port() == "6543" {
		return invalid()
	}
	if c.Target == "fixture" {
		host := u.Hostname()
		if host != "postgres" && host != "localhost" && host != "127.0.0.1" && host != "::1" {
			return invalid()
		}
		if u.Path != "/summergear_foundation_test" || query.Get("sslmode") != "disable" {
			return invalid()
		}
	} else {
		host := u.Hostname()
		if !strings.HasSuffix(host, ".supabase.co") && !strings.HasSuffix(host, ".pooler.supabase.com") {
			return invalid()
		}
		if u.Path != "/postgres" || query.Get("sslmode") != "verify-full" {
			return invalid()
		}
	}
	return nil
}

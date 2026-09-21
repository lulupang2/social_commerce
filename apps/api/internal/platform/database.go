package platform

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrDatabase = errors.New("database operation failed")

func OpenDatabase(ctx context.Context, cfg Config) (*pgxpool.Pool, error) {
	pc, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, errors.New("database configuration rejected")
	}
	pc.MaxConns, pc.MinConns = cfg.MaxConns, 0
	pc.MaxConnIdleTime, pc.MaxConnLifetime = time.Minute, 30*time.Minute
	pc.ConnConfig.ConnectTimeout = 5 * time.Second
	pc.ConnConfig.RuntimeParams["application_name"] = "summergear-" + string(cfg.Role)
	pc.ConnConfig.RuntimeParams["statement_timeout"] = "10000"
	pc.ConnConfig.RuntimeParams["idle_in_transaction_session_timeout"] = "15000"
	pc.ConnConfig.RuntimeParams["search_path"] = "pg_catalog"
	if cfg.ConnectionMode == "transaction" {
		pc.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	}
	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return nil, errors.New("database initialization failed")
	}
	checkCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	if err := VerifyDatabase(checkCtx, pool, cfg); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

// The DBA-created marker binds every process to the same explicitly approved
// test database even when API and worker use different Supabase endpoints.
func VerifyDatabase(ctx context.Context, pool *pgxpool.Pool, cfg Config) error {
	var role string
	var unsafe, membership bool
	err := pool.QueryRow(ctx, `SELECT current_user,
		rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls,
		EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid)
		FROM pg_roles WHERE rolname=current_user`).Scan(&role, &unsafe, &membership)
	if err != nil {
		return errors.New("database role verification failed")
	}
	if role != ExpectedRole(cfg.Role) || unsafe || (cfg.Role != Migration && membership) {
		return errors.New("database role has unexpected identity or excessive privileges")
	}
	var target string
	err = pool.QueryRow(ctx, `SELECT target_id FROM summergear_meta.environment_guard WHERE singleton=true`).Scan(&target)
	if err != nil || target != cfg.TargetID {
		return errors.New("database target guard failed; provision the isolated test target first")
	}
	return nil
}

func Ready(ctx context.Context, pool *pgxpool.Pool) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := pool.Ping(ctx); err != nil {
		return ErrDatabase
	}
	// Verify the actual runtime permissions and migrated objects, not just TCP.
	if _, err := pool.Exec(ctx, `SELECT id FROM summergear_app.sample_requests LIMIT 0`); err != nil {
		return ErrDatabase
	}
	if _, err := pool.Exec(ctx, `SELECT id FROM summergear_river.river_job LIMIT 0`); err != nil {
		return ErrDatabase
	}
	return nil
}

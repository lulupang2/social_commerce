package migrate

import (
	"context"
	"errors"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
)

const AppVersion = "0007_go_foundation"
const RiverVersion = 7 // Official migrations bundled with River v0.47.0.
const lockID int64 = 719760051001

type Status struct {
	AppVersion   string `json:"appVersion"`
	RiverVersion int    `json:"riverVersion"`
	Ready        bool   `json:"ready"`
}

// Up preserves the original 0007-only fixture entry point. New deployments use
// Run with the complete ordered manifest, never a single newer SQL file.
func Up(ctx context.Context, pool *pgxpool.Pool, sql []byte, logger *slog.Logger) (Status, error) {
	return Run(ctx, pool, []File{{Version: AppVersion, SQL: sql}}, true, logger)
}

func Inspect(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) (Status, error) {
	var status Status
	if err := pool.QueryRow(ctx, `SELECT version FROM summergear_meta.schema_migrations ORDER BY version DESC LIMIT 1`).Scan(&status.AppVersion); err != nil {
		return status, errors.New("app migration not ready")
	}
	m, err := rivermigrate.New(riverpgxv5.New(pool), &rivermigrate.Config{Schema: platform.RiverSchema, Logger: logger})
	if err != nil {
		return status, errors.New("River migration initialization failed")
	}
	versions, err := m.ExistingVersions(ctx)
	if err != nil {
		return status, errors.New("River migration status unavailable")
	}
	for _, version := range versions {
		if version.Version > status.RiverVersion {
			status.RiverVersion = version.Version
		}
	}
	valid, err := m.Validate(ctx, &rivermigrate.ValidateOpts{TargetVersion: RiverVersion})
	if err != nil || !valid.OK || status.RiverVersion != RiverVersion {
		return status, errors.New("River migration version mismatch")
	}
	status.Ready = true
	return status, nil
}

// River's v0.47 INSERT ... ON CONFLICT needs UPDATE(kind), even for an
// insert-only client. It does not justify granting UPDATE(state) or DELETE.
// Runtime roles cannot mutate migration history or own queue objects.
const grants = `
REVOKE ALL ON SCHEMA summergear_river FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA summergear_river FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA summergear_river FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA summergear_river FROM PUBLIC;
GRANT USAGE ON SCHEMA summergear_river TO summergear_api, summergear_worker;
GRANT SELECT, INSERT ON summergear_river.river_job TO summergear_api;
GRANT UPDATE(kind) ON summergear_river.river_job TO summergear_api;
GRANT USAGE, SELECT ON SEQUENCE summergear_river.river_job_id_seq TO summergear_api;
GRANT SELECT ON summergear_river.river_migration TO summergear_api, summergear_worker;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA summergear_river TO summergear_api, summergear_worker;
GRANT SELECT,INSERT,UPDATE,DELETE ON summergear_river.river_job, summergear_river.river_queue,
  summergear_river.river_leader, summergear_river.river_notification TO summergear_worker;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA summergear_river TO summergear_worker;
DO $block$
DECLARE browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA summergear_meta, summergear_app, summergear_river FROM %I',browser_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA summergear_meta, summergear_app, summergear_river FROM %I',browser_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA summergear_meta, summergear_app, summergear_river FROM %I',browser_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA summergear_meta, summergear_app, summergear_river FROM %I',browser_role);
    END IF;
  END LOOP;
END $block$;
`

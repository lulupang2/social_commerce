-- Explicit one-time DBA provisioning for a NEW ISOLATED TEST DATABASE ONLY.
-- Never run against the production project. Existing roles/schemas cause failure.
-- psql reads credentials from its process environment; do not use -a/-e or set -x.
\set ON_ERROR_STOP on
\getenv api_password SUMMERGEAR_API_PASSWORD
\getenv worker_password SUMMERGEAR_WORKER_PASSWORD
\getenv migration_password SUMMERGEAR_MIGRATION_PASSWORD
\getenv target_id DB_TARGET_ID
BEGIN;
CREATE ROLE summergear_api LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'api_password';
CREATE ROLE summergear_worker LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'worker_password';
CREATE ROLE summergear_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'migration_password';
-- A managed DBA may need membership to create schemas owned by the new role.
GRANT summergear_migrator TO CURRENT_USER;
SELECT format('GRANT CONNECT ON DATABASE %I TO summergear_api, summergear_worker, summergear_migrator',current_database()) \gexec
CREATE SCHEMA summergear_meta AUTHORIZATION summergear_migrator;
CREATE SCHEMA summergear_app AUTHORIZATION summergear_migrator;
CREATE SCHEMA summergear_river AUTHORIZATION summergear_migrator;
REVOKE ALL ON SCHEMA summergear_meta, summergear_app, summergear_river FROM PUBLIC;
SET LOCAL ROLE summergear_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA summergear_meta, summergear_app, summergear_river REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE summergear_meta.environment_guard (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  target_id text NOT NULL UNIQUE CHECK(length(target_id)>=16),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO summergear_meta.environment_guard(target_id) VALUES (:'target_id');
GRANT USAGE ON SCHEMA summergear_meta TO summergear_api, summergear_worker;
GRANT SELECT ON summergear_meta.environment_guard TO summergear_api, summergear_worker;
COMMIT;

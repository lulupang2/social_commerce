#!/usr/bin/env bash
# Runs only inside the new disposable Postgres container.
set -euo pipefail
[[ ${POSTGRES_DB:-} == summergear_foundation_test ]] || exit 1
[[ ${DB_TARGET_ID:-} == summergear-foundation-fixture-v1 ]] || exit 1
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-psqlrc -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
SQL
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-psqlrc -v ON_ERROR_STOP=1 -f /foundation/bootstrap.sql >/dev/null

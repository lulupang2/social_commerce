#!/usr/bin/env bash
# Only a new isolated fixture is created. Never reads test.env or reaches Supabase.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
mkdir -p .foundation-cache/results
exec 9>.foundation-cache/test.lock
flock -n 9 || { echo 'Another project test is active' >&2; exit 1; }
project=summergear-auth-test
compose=(docker compose --project-name "$project" -f ops/nhn-rocky/compose.foundation-test.yml)
if [[ -n $(docker ps -aq --filter label=com.docker.compose.project="$project") ]] ||
   [[ -n $(docker volume ls -q --filter label=com.docker.compose.project="$project") ]] ||
   [[ -n $(docker network ls -q --filter label=com.docker.compose.project="$project") ]]; then
  echo 'Existing auth-test resources found; refusing to replace or delete them' >&2
  exit 1
fi
cleanup() { "${compose[@]}" --profile runtime --profile tools down --volumes --remove-orphans; }
trap cleanup EXIT
"${compose[@]}" config --quiet
bash ops/nhn-rocky/go-toolchain.sh prepare
"${compose[@]}" up -d --wait postgres
bash ops/nhn-rocky/go-toolchain.sh auth-integration 2>&1 | tee .foundation-cache/results/auth-database.log
printf 'PASS: auth protocol, PostgreSQL migrations/accounts/sessions/permissions/CSRF/reauthentication\n'

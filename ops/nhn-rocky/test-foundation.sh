#!/usr/bin/env bash
# Destructive only to a NEW, private Compose fixture created by this invocation.
# Never reads test.env and never connects to Supabase.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
mkdir -p .foundation-cache/results
exec 9>.foundation-cache/test.lock
flock -n 9 || { echo 'Another foundation test is active' >&2; exit 1; }
compose=(docker compose --project-name summergear-foundation-test -f ops/nhn-rocky/compose.foundation-test.yml)
if [[ -n $(docker ps -aq --filter label=com.docker.compose.project=summergear-foundation-test) ]] ||
   [[ -n $(docker volume ls -q --filter label=com.docker.compose.project=summergear-foundation-test) ]] ||
   [[ -n $(docker network ls -q --filter label=com.docker.compose.project=summergear-foundation-test) ]]; then
  echo 'Existing foundation-test resources found; refusing to replace/delete them automatically' >&2
  exit 1
fi
cleanup() {
  "${compose[@]}" --profile runtime --profile tools down --volumes --remove-orphans
}
trap cleanup EXIT
"${compose[@]}" config --quiet
bash ops/nhn-rocky/go-toolchain.sh check 2>&1 | tee .foundation-cache/results/unit-build.log
"${compose[@]}" up -d --wait postgres
bash ops/nhn-rocky/go-toolchain.sh integration 2>&1 | tee .foundation-cache/results/integration.log
"${compose[@]}" --profile runtime run --rm --no-deps migrate
"${compose[@]}" --profile runtime up -d --no-deps api worker
for attempt in $(seq 1 30); do
  if "${compose[@]}" exec -T api curl --fail --silent http://127.0.0.1:8080/health/ready >/dev/null; then break; fi
  sleep 1
  [[ $attempt != 30 ]] || { echo 'Compose API did not become ready' >&2; exit 1; }
done
python3 ops/nhn-rocky/verify-fixture-runtime.py
"${compose[@]}" --profile tools run --rm --no-deps sample --key compose-smoke
for attempt in $(seq 1 40); do
  done_count=$("${compose[@]}" exec -T postgres psql -U fixture_admin -d summergear_foundation_test -Atc "SELECT count(*) FROM summergear_app.sample_effects e JOIN summergear_app.sample_requests r ON r.id=e.request_id WHERE r.idempotency_key='compose-smoke'")
  if [[ $done_count == 1 ]]; then break; fi
  sleep 1
  [[ $attempt != 40 ]] || { echo 'Compose worker did not complete sample' >&2; exit 1; }
done
"${compose[@]}" stop api worker
printf 'PASS: unit/race/vet/build, fixture integration, Compose API+worker+migrator+sample\n'

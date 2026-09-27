#!/usr/bin/env bash
# Only provisions roles and, when explicitly requested, one approved fixture listing.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
project=${1:?usage: provision-review-fixture.sh COMPOSE_PROJECT [APPROVED_LISTING_UUID]}
listing_id=${2:-}
[[ $project == summergear-* ]] || { echo 'disposable fixture project required' >&2; exit 1; }
cd "$repo"
docker compose --project-name "$project" -f ops/nhn-rocky/compose.foundation-test.yml exec -T postgres \
  psql -U fixture_admin -d summergear_foundation_test --no-psqlrc -v ON_ERROR_STOP=1 \
  -v listing_id="$listing_id" < ops/nhn-rocky/db/review-fixture.sql

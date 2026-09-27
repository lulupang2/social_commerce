#!/usr/bin/env bash
# Grant review/operator duties only in a disposable fixture, as fixture_admin.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
project=${1:?usage: grant-fixture-reviewer.sh COMPOSE_PROJECT MEMBER_UUID}
member=${2:?usage: grant-fixture-reviewer.sh COMPOSE_PROJECT MEMBER_UUID}
[[ $project == summergear-* && $member =~ ^[0-9a-fA-F-]{36}$ ]] || {
  echo 'disposable project and member UUID required' >&2; exit 1;
}
cd "$repo"
docker compose --project-name "$project" -f ops/nhn-rocky/compose.foundation-test.yml exec -T postgres \
  psql -U fixture_admin -d summergear_foundation_test --no-psqlrc -v ON_ERROR_STOP=1 \
  -v member_id="$member" <<'SQL'
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'summergear_foundation_test'
     OR (SELECT target_id FROM summergear_meta.environment_guard WHERE singleton)
        IS DISTINCT FROM 'summergear-foundation-fixture-v1' THEN
    RAISE EXCEPTION 'disposable fixture database required';
  END IF;
END $$;
INSERT INTO summergear_app.listing_reviewers(member_id)
 SELECT id FROM summergear_app.members WHERE id=:'member_id'::uuid AND status='active'
 ON CONFLICT(member_id) DO NOTHING;
SELECT set_config('summergear.fixture_reviewer_id',:'member_id',true);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM summergear_app.listing_reviewers
    WHERE member_id=current_setting('summergear.fixture_reviewer_id',true)::uuid) THEN
    RAISE EXCEPTION 'active member required';
  END IF;
END $$;
COMMIT;
SQL

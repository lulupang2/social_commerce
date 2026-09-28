#!/usr/bin/env bash
# Runs browser commerce E2E against an isolated local Compose/PostgreSQL fixture.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
for command in docker pnpm curl; do command -v "$command" >/dev/null || { echo "Required command missing: $command" >&2; exit 1; }; done
base_url=${E2E_BASE_URL:-http://127.0.0.1:3210}
web_port=${E2E_WEB_PORT:-3210}
api_port=${E2E_API_PORT:-18081}
[[ $base_url == "http://127.0.0.1:$web_port" ]] || { echo 'E2E_BASE_URL must match http://127.0.0.1:E2E_WEB_PORT' >&2; exit 1; }
[[ $web_port =~ ^[0-9]+$ && $api_port =~ ^[0-9]+$ ]] || { echo 'E2E ports must be numeric' >&2; exit 1; }
nonce="$(date +%s)-$$-${RANDOM}"
project="summergear-core-e2e-$nonce"
cache=".foundation-cache/commerce-e2e-$nonce"
bin="$repo/$cache/bin"
mount_repo=$repo
# Ensure this exact generated name has no prior filesystem or Docker resources.
[[ ! -e $cache ]] || { echo 'Generated cache collision; refusing to reuse it' >&2; exit 1; }
for kind in container volume network; do
  case $kind in
    container) found=$(docker ps -aq --filter "label=com.docker.compose.project=$project") ;;
    volume) found=$(docker volume ls -q --filter "label=com.docker.compose.project=$project") ;;
    network) found=$(docker network ls -q --filter "label=com.docker.compose.project=$project") ;;
  esac
  [[ -z $found ]] || { echo "Generated project collision ($kind); refusing cleanup" >&2; exit 1; }
done
mkdir -p "$bin" .foundation-cache/mod .foundation-cache/build
if [[ -n ${MSYSTEM:-} ]]; then
  mount_repo=$(cygpath -m "$repo")
  export MSYS2_ARG_CONV_EXCL='*'
fi
export E2E_BIN_DIR="$mount_repo/$cache/bin" E2E_BASE_URL="$base_url" E2E_API_PORT="$api_port"
compose=(docker compose --project-name "$project" -f ops/nhn-rocky/compose.foundation-test.yml -f ops/nhn-rocky/compose.commerce-e2e.yml)
web_pid=''
cleanup() {
  status=$?
  trap - EXIT INT TERM
  if (( status != 0 )); then
    mkdir -p .foundation-cache/results
    "${compose[@]}" --profile runtime logs --no-color --tail=80 api postgres >".foundation-cache/results/$project.compose.log" 2>&1 || true
    if [[ -f $cache/next.log ]]; then cp "$cache/next.log" ".foundation-cache/results/$project.next.log"; fi
    echo "Isolated E2E failure logs: .foundation-cache/results/$project.*.log" >&2
  fi
  if [[ -n $web_pid ]]; then kill "$web_pid" 2>/dev/null || true; wait "$web_pid" 2>/dev/null || true; fi
  # The project was proven absent before creation; only its named resources are removed.
  "${compose[@]}" --profile runtime down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf -- "$cache"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
image='golang:1.27.1-bookworm@sha256:648f440f42a0958804efb24df176f806f9d353b41f1c0627f666428e40310f6b'
docker run --rm --user "$(id -u):$(id -g)" -e GOTOOLCHAIN=local -e GOFLAGS=-buildvcs=false -e HOME=/tmp -e GOMODCACHE=/gomodcache -e GOCACHE=/gocache \
  -v "$mount_repo:/workspace:ro" -v "$E2E_BIN_DIR:/e2e-bin" -v "$mount_repo/.foundation-cache/mod:/gomodcache" -v "$mount_repo/.foundation-cache/build:/gocache" -w /workspace/apps/api "$image" bash -ceu '
    CGO_ENABLED=0 go build -mod=readonly -p=1 -trimpath -tags=authfixture -o /e2e-bin/api ./cmd/api
    CGO_ENABLED=0 go build -mod=readonly -p=1 -trimpath -o /e2e-bin/migrate ./cmd/migrate
  '
"${compose[@]}" config --quiet
"${compose[@]}" up -d --wait postgres
"${compose[@]}" --profile runtime run --rm --no-deps migrate
"${compose[@]}" --profile runtime up -d --no-deps api
bash ops/nhn-rocky/provision-review-fixture.sh "$project"
for attempt in $(seq 1 60); do
  if curl --fail --silent "http://127.0.0.1:$api_port/health/ready" >/dev/null 2>&1; then break; fi
  [[ $attempt != 60 ]] || { echo 'Go API did not become ready' >&2; exit 1; }
  sleep 1
done
# Bind Next to loopback and point rewrites directly at the actual Go fixture API.
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUMMERGEAR_GO_API_ORIGIN="http://127.0.0.1:$api_port" pnpm --filter @icegear/web dev --hostname 127.0.0.1 --port "$web_port" >"$cache/next.log" 2>&1 &
web_pid=$!
for attempt in $(seq 1 120); do
  if curl --fail --silent "$base_url/" >/dev/null 2>&1; then break; fi
  kill -0 "$web_pid" 2>/dev/null || { echo 'Next.js exited before readiness; see isolated Next log' >&2; cat "$cache/next.log" >&2; exit 1; }
  [[ $attempt != 120 ]] || { echo 'Next.js did not become ready; see isolated Next log' >&2; cat "$cache/next.log" >&2; exit 1; }
  sleep 1
done
E2E_BASE_URL="$base_url" pnpm --filter @icegear/web test:e2e "$@"

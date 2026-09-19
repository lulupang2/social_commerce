#!/usr/bin/env bash
# Project-scoped pinned toolchain. Does not install host Go or change other services.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
mkdir -p .foundation-cache/{mod,build,bin,results}
image='golang:1.27.1-bookworm@sha256:648f440f42a0958804efb24df176f806f9d353b41f1c0627f666428e40310f6b'
args=(--rm --name summergear-foundation-toolchain --memory=768m --cpus=1 --pids-limit=256
  --user "$(id -u):$(id -g)" -e GOMAXPROCS=2 -e GOMEMLIMIT=384MiB
  -e GOTOOLCHAIN=local -e HOME=/tmp -e GOMODCACHE=/workspace/.foundation-cache/mod
  -e GOCACHE=/workspace/.foundation-cache/build -v "$repo:/workspace"
  -w /workspace/apps/api)
if [[ ${1:-prepare} == integration || ${1:-prepare} == auth-integration || ${1:-prepare} == listings-integration ]]; then
  # All credentials below are public disposable-fixture credentials, never test.env.
  network=summergear-foundation-test_default
  if [[ ${1:-prepare} == auth-integration ]]; then network=summergear-auth-test_default; fi
  if [[ ${1:-prepare} == listings-integration ]]; then network=summergear-listings-test_default; fi
  args+=(--network "$network"
    -e SUMMERGEAR_INTEGRATION=fixture -e APP_ENV=test -e PAYMENT_MODE=test
    -e DB_TARGET=fixture -e DB_TARGET_ID=summergear-foundation-fixture-v1
    -e DATABASE_URL=postgres://summergear_api:fixture_api@postgres:5432/summergear_foundation_test?sslmode=disable
    -e RIVER_DATABASE_URL=postgres://summergear_worker:fixture_worker@postgres:5432/summergear_foundation_test?sslmode=disable
    -e MIGRATION_DATABASE_URL=postgres://summergear_migrator:fixture_migrator@postgres:5432/summergear_foundation_test?sslmode=disable
    -e FIXTURE_FAST_JOBS=true -e API_ADDR=127.0.0.1:18080
    -e FOUNDATION_BIN_DIR=/workspace/.foundation-cache/bin)
fi
exec docker run "${args[@]}" "$image" bash /workspace/ops/nhn-rocky/in-toolchain.sh "${1:-prepare}"

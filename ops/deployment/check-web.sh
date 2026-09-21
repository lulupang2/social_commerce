#!/usr/bin/env bash
set -euo pipefail
cd /workspace
test "$(pnpm --version)" = 10.34.5
pnpm --filter @icegear/domain build
pnpm --filter @icegear/web exec next typegen
pnpm typecheck
pnpm --filter @icegear/web test
pnpm --filter @icegear/web lint
pnpm --filter @icegear/web build

#!/usr/bin/env bash
set -euo pipefail
cd /workspace/apps/api
# Serialize packages: these tests migrate and temporarily alter shared fixture permissions.
go test -race -p=1 -tags=integration -count=1 -timeout=240s -v ./internal/integration
go test -race -p=1 -tags=integration,authfixture -count=1 -timeout=240s -v ./internal/auth
go test -race -p=1 -tags=integration -count=1 -timeout=240s -v ./internal/listings ./internal/listingimages

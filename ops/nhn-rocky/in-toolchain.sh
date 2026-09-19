#!/usr/bin/env bash
set -euo pipefail
cd /workspace/apps/api
case ${1:-prepare} in
  prepare)
    gofmt -w cmd internal
    go mod tidy
    go mod verify
    go build -p=1 ./...
    ;;
  check)
    test -z "$(gofmt -l cmd internal)"
    go mod verify
    go vet -p=1 ./...
    go test -race -p=1 -count=1 -v ./...
    for app in api worker migrate sample; do
      CGO_ENABLED=0 go build -p=1 -trimpath -o "/workspace/.foundation-cache/bin/$app" "./cmd/$app"
    done
    ;;
  auth-check)
    test -z "$(gofmt -l cmd internal)"
    go vet -p=1 -tags=authfixture ./...
    go test -race -p=1 -tags=authfixture -count=1 -v ./internal/auth
    CGO_ENABLED=0 go build -p=1 -tags=authfixture -trimpath -o /workspace/.foundation-cache/bin/api-authfixture ./cmd/api
    CGO_ENABLED=0 go build -p=1 -tags=authfixture -trimpath -o /workspace/.foundation-cache/bin/oauthfixture ./cmd/oauthfixture
    ;;
  auth-integration)
    go test -race -p=1 -tags=integration,authfixture -count=1 -timeout=180s -v ./internal/auth
    ;;
  listings-integration)
    go test -race -p=1 -tags=integration -count=1 -timeout=180s -v ./internal/listings
    ;;
  integration)
    go test -race -p=1 -tags=integration -count=1 -timeout=240s -v ./internal/integration
    ;;
  *) echo 'Unknown toolchain action' >&2; exit 2 ;;
esac

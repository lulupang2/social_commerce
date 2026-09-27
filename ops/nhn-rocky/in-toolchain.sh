#!/usr/bin/env bash
set -euo pipefail
cd /workspace/apps/api
case ${1:-prepare} in
  prepare)
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
    # The fixture must be migrated before package discovery: jobs can sort first.
    go run ./cmd/migrate --apply --app-migrations-dir /workspace/supabase/migrations
    # Include newly added DB test packages automatically. The foundation and
    # auth suites run separately with their own build tags and must not repeat.
    packages=()
    for package in ./internal/*; do
      [[ -d "$package" && "$package" != ./internal/auth && "$package" != ./internal/integration ]] || continue
      tests=( "$package"/*integration_test.go )
      [[ -f "${tests[0]}" ]] && packages+=( "$package" )
    done
    ((${#packages[@]} > 0)) || { echo 'No application DB integration packages found' >&2; exit 1; }
    printf 'Running fixture DB integration packages: %s\n' "${packages[*]}"
    go test -race -p=1 -tags=integration -count=1 -timeout=240s -v "${packages[@]}"
    ;;
  integration)
    go test -race -p=1 -tags=integration -count=1 -timeout=240s -v ./internal/integration
    ;;
  *) echo 'Unknown toolchain action' >&2; exit 2 ;;
esac

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
for target in api worker migration; do
  docker build --target "$target" -f ops/deployment/Dockerfile.go -t "summergear-$target:deployment-ci" .
done
docker build --target web -f ops/deployment/Dockerfile.web -t summergear-web:deployment-ci .

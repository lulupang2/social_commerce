#!/usr/bin/env bash
# Run as the existing Docker deployment user; source/configuration stays on the server.
set -Eeuo pipefail
umask 077

image=${1:?immutable GHCR image required}
registry_user=${2:?registry user required}
[[ $image =~ ^ghcr\.io/[a-z0-9_./-]+@sha256:[a-f0-9]{64}$ ]] || exit 1
: "${GHCR_TOKEN:?short-lived registry token required}"

config="$HOME/.config/summergear/web-deploy.env"
[[ -f $config ]] || { echo "Create $config using WEB-DEPLOY.md first." >&2; exit 1; }
[[ $(stat -c '%a' "$config") == 600 && -O $config ]] || { echo 'Deployment config must be owned by this user with mode 600.' >&2; exit 1; }
# Trusted, operator-owned shell configuration, never repository secrets.
# shellcheck source=/dev/null
source "$config"
: "${DEPLOY_DIR:?existing deployment checkout required}"
: "${PUBLIC_WEB_URL:?preview HTTPS origin required}"
[[ $DEPLOY_DIR == /* && $PUBLIC_WEB_URL == https://* ]]
export PUBLIC_WEB_URL
export GATEWAY_PORT=${GATEWAY_PORT:-18080}
project=summergear-preview
state="$HOME/.local/state/summergear/web-deploy"
mkdir -p "$state"
exec 9> "$state/deploy.lock"
flock -w 600 9

container() {
  local ids
  ids=$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$1")
  [[ -n $ids && $ids != *$'\n'* ]] || { echo "Expected one running $1 container." >&2; return 1; }
  printf '%s' "$ids"
}
web=$(container web)
gateway=$(container gateway)
previous=$(docker inspect -f '{{.Image}}' "$web")
[[ $previous =~ ^sha256:[a-f0-9]{64}$ ]]

base="$DEPLOY_DIR/ops/deployment/compose.ci.yml"
preview="$DEPLOY_DIR/ops/deployment/compose.preview.yml"
[[ -f $base && -f $preview ]]
# Refuse to silently change a web service with additional runtime overlays.
actual_files=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$web")
expected_files="$base,$preview"
override="$state/compose.web.yml"
[[ $actual_files == "$expected_files" || $actual_files == "$expected_files,$override" ]] || {
  echo 'Current web Compose files differ from this preview configuration. Review before deploying.' >&2
  exit 1
}

auth_dir=$(mktemp -d)
trap 'rm -rf -- "$auth_dir"' EXIT
printf '%s' "$GHCR_TOKEN" | docker --config "$auth_dir" login ghcr.io --username "$registry_user" --password-stdin >/dev/null
unset GHCR_TOKEN
docker --config "$auth_dir" pull "$image"

cat > "$override" <<'YAML'
services:
  web:
    image: ${WEB_IMAGE:?immutable web image required}
YAML
compose=(docker compose -p "$project" -f "$base" -f "$preview" -f "$override")
export WEB_IMAGE=$image
"${compose[@]}" config --quiet

# Keep a tagged copy for rollback even if the original tag is moved later.
rollback_tag="summergear-web:rollback-$(date -u +%Y%m%dT%H%M%S)-$$"
docker tag "$previous" "$rollback_tag"
printf 'WEB_IMAGE=%s\n' "$rollback_tag" > "$state/previous-image.env"

record_current() {
  printf 'WEB_IMAGE=%s\n' "$WEB_IMAGE" > "$state/current-image.env.tmp"
  mv "$state/current-image.env.tmp" "$state/current-image.env"
}
check_gateway() {
  docker exec "$gateway" nginx -s reload
  for _ in {1..15}; do
    if docker exec "$gateway" wget -q -O /dev/null http://127.0.0.1:8080/; then return 0; fi
    sleep 2
  done
  return 1
}
rollback() {
  trap - ERR INT TERM HUP
  set +e
  echo 'Web deployment failed; restoring previous image.' >&2
  export WEB_IMAGE=$rollback_tag
  if "${compose[@]}" up -d --no-deps --pull never --wait --wait-timeout 120 web && check_gateway; then
    record_current
    echo 'Previous web image restored.' >&2
  else
    echo "ROLLBACK FAILED. Previous image: $rollback_tag; inspect the web and gateway containers." >&2
  fi
  exit 1
}
trap rollback ERR INT TERM HUP
"${compose[@]}" up -d --no-deps --pull never --wait --wait-timeout 120 web
web=$(container web)
[[ $(docker inspect -f '{{.Image}}' "$web") == "$(docker image inspect -f '{{.Id}}' "$image")" ]]
check_gateway
record_current
trap - ERR INT TERM HUP
echo "Web deployment healthy: $image"

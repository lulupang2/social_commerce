#!/usr/bin/env bash
set -euo pipefail

for name in DEPLOY_HOST DEPLOY_USER DEPLOY_PORT DEPLOY_SSH_KEY DEPLOY_KNOWN_HOSTS GH_TOKEN GHCR_USER WEB_IMAGE SOURCE_SHA REPOSITORY; do
  [[ -n ${!name:-} ]] || { echo "Missing deployment setting: $name" >&2; exit 1; }
done
[[ $DEPLOY_HOST =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ $DEPLOY_USER =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]]
[[ $DEPLOY_PORT =~ ^[0-9]{1,5}$ ]] && (( DEPLOY_PORT > 0 && DEPLOY_PORT <= 65535 ))
[[ $GHCR_USER =~ ^[a-zA-Z0-9_-]+$ ]]
[[ $WEB_IMAGE =~ ^ghcr\.io/[a-z0-9_./-]+@sha256:[a-f0-9]{64}$ ]]

# A rerun of an old successful CI must not roll main back.
current=$(gh api "repos/$REPOSITORY/git/ref/heads/main" --jq .object.sha)
if [[ $current != "$SOURCE_SHA" ]]; then
  echo 'A newer main commit exists; skipping SSH deployment.' >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi

umask 077
ssh_dir=$(mktemp -d)
trap 'rm -rf -- "$ssh_dir"' EXIT
# Secrets may have been registered from a Windows terminal.
printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' > "$ssh_dir/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" | tr -d '\r' > "$ssh_dir/known_hosts"
unset DEPLOY_SSH_KEY DEPLOY_KNOWN_HOSTS

# The short-lived, read-only registry token travels over SSH stdin, never argv.
{
  printf '%s\n' "$GH_TOKEN"
  cat ops/deployment/deploy-web.sh
} | ssh -T -p "$DEPLOY_PORT" -i "$ssh_dir/key" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=$ssh_dir/known_hosts" -o ConnectTimeout=15 \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
  "$DEPLOY_USER@$DEPLOY_HOST" \
  "read -r GHCR_TOKEN; export GHCR_TOKEN; bash -s -- '$WEB_IMAGE' '$GHCR_USER'"

echo "Deployed web: \`$WEB_IMAGE\`" >> "$GITHUB_STEP_SUMMARY"

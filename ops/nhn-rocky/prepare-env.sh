#!/usr/bin/env bash
# Prepare empty, private settings only. Does not install, start, or deploy services.
set -euo pipefail
umask 077
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
config_dir="${HOME}/.config/summergear"
mkdir -p -- "$config_dir"
chmod 700 -- "$config_dir"
if [[ ! -e "$config_dir/test.env" ]]; then
  cp -- "$repo_dir/ops/nhn-rocky/.env.example" "$config_dir/test.env"
fi
if [[ ! -e "$repo_dir/apps/web/.env.local" ]]; then
  printf '%s\n' '# Current Next.js app: use the isolated TEST Supabase project.' \
    'NEXT_PUBLIC_SUPABASE_URL=' 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' > "$repo_dir/apps/web/.env.local"
fi
if [[ ! -e "$repo_dir/apps/mobile/.env" ]]; then
  printf '%s\n' '# Optional Expo settings for the TEST environment.' \
    'EXPO_PUBLIC_WEB_URL=' 'EXPO_PUBLIC_SUPABASE_URL=' \
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' > "$repo_dir/apps/mobile/.env"
fi
chmod 600 -- "$config_dir/test.env" "$repo_dir/apps/web/.env.local" "$repo_dir/apps/mobile/.env"
printf 'Prepared settings (existing contents preserved):\n%s\n%s\n%s\n' \
  "$config_dir/test.env" "$repo_dir/apps/web/.env.local" "$repo_dir/apps/mobile/.env"

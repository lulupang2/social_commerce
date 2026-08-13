# IceGear

IceGear is a TypeScript monorepo with a Next.js web app and an Expo Router mobile app.
The MVP baseline ships public marketplace browse/detail flows on web and mobile, validated
mobile draft-listing creation, shared domain contracts, and a Supabase migration with RLS
and deterministic sports seed data. A Supabase project and runtime environment values are
still required before connected data and authenticated writes are available.

## Prerequisites

- Node.js 22.13 or newer
- pnpm 10.34.5 (the repository pins this through `packageManager`)

Enable pnpm with Corepack, then install all workspace dependencies:

```bash
corepack enable
pnpm install
```

## Environment

The checked-in app example files define the public Supabase configuration boundary; see
[Connected Supabase setup](#connected-supabase-setup) below for the local copy and project
setup steps. Only public/publishable values belong in these files.

## Development commands

Run both apps from separate terminals:

```bash
pnpm dev:web
pnpm dev:mobile
```

Or run both workspace dev servers together:

```bash
pnpm dev
```

Other useful checks:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm format:check
pnpm export:mobile:web
```

The web app serves the server-rendered home page at `http://localhost:3000` and a small
health page at `http://localhost:3000/health`; its JSON health endpoint is available at
`http://localhost:3000/api/health`. Expo prints the mobile development target after
`pnpm dev:mobile` starts. Without public Supabase values, both clients render an explicit
setup state instead of attempting a privileged connection.

## Repository layout

```text
apps/
  web/       Next.js App Router application
  mobile/    Expo Router TypeScript application
packages/
  domain/    Shared listing/profile contracts and Zod validation
supabase/
  migrations/  PostgreSQL schema and RLS policies
  seed.sql     Deterministic sports reference data
```

## Connected Supabase setup

Copy the example files and fill them with the URL and publishable key for the same
environment:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

The web client uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the mobile client uses
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the web code accepts
`NEXT_PUBLIC_SUPABASE_ANON_KEY` only as a legacy alias. Never put a `service_role` key,
database password, or other secret in a `NEXT_PUBLIC_` or `EXPO_PUBLIC_` variable. After
linking/configuring the Supabase project, apply the checked-in migration and seed with the
Supabase CLI (`supabase db reset` for a configured local project). The seed creates only
the ski and hockey sports rows; Auth users, profiles, and user listings must be created by
the configured application flow.

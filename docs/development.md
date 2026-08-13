# IceGear MVP development guide

**Status:** MVP implementation workflow; the client/domain/schema baseline is bootstrapped, while Supabase project and runtime environment setup remain deployment work.

The repository contains a pnpm workspace, a Next.js web MVP, an Expo Router mobile MVP, shared `packages/domain` contracts, and a Supabase migration plus deterministic seed. The checked-in `.env.example` files contain placeholders only; no Supabase project credentials or service-role key belong in the repository.

## Prerequisites

Install the versions pinned by the repository toolchain files:

- Node.js 22.13.0 or newer (see `.node-version`).
- pnpm 10.34.5 (pinned by the root `packageManager` field and activated through Corepack or the team's approved installation).
- Git.
- Supabase CLI for local database/auth development.
- Xcode/iOS Simulator or Android Studio/emulator when working on native targets.
- A supported browser for the Next.js app.

Use the pinned versions when reproducing the validation matrix. Native development additionally requires Xcode/iOS Simulator or Android Studio/emulator.

## Workspace setup

From a clean checkout, install dependencies and run the checks that do not require a Supabase project:

```sh
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm format:check
pnpm export:mobile:web
```

These commands are the current monorepo validation baseline. Web and mobile clients intentionally render a setup state when the public Supabase variables are missing. To run connected development, copy the example files, fill in the public project URL and publishable key, configure or link a Supabase project, apply the migration and seed, then run `pnpm dev`.

Current scripts:

| Command | Purpose | Status |
| --- | --- | --- |
| `pnpm dev` | Start web and mobile development processes in parallel | Available |
| `pnpm dev:web` | Start the Next.js web app | Available |
| `pnpm dev:mobile` | Start Expo tooling | Available |
| `pnpm --dir packages/domain typecheck` | Type-check the shared domain package | Available |
| `pnpm --dir packages/domain test` | Run domain validation tests | Available |
| `pnpm --dir packages/domain build` | Build the domain package | Available; writes ignored `dist/` |
| `pnpm lint` | Run app lint checks across the workspace | Available |
| `pnpm typecheck` | Type-check all workspace packages | Available |
| `pnpm test` | Run available package/web tests | Available |
| `pnpm build` | Build the web and domain packages | Available |
| `pnpm format:check` | Check Prettier formatting for repository-owned files | Available |
| `pnpm export:mobile:web` | Export the Expo app for the web platform | Available; writes ignored `apps/mobile/dist/` |
| `supabase db reset` | Recreate the local database and apply migration plus seed | Requires Supabase CLI project config |

Scripts must fail on errors and be safe to run repeatedly. Avoid adding a script that silently bypasses RLS or uses a production service key locally.

## Environment files

Use separate environment values for local, preview/staging, and production. The current mapping is documented in [SSOT.md](SSOT.md#environment-variables).

Suggested local files (names may be adapted to the selected framework conventions):

```text
apps/web/.env.local       # ignored; web public + server configuration
apps/mobile/.env          # ignored; Expo public configuration only
.env.example              # committed names and safe placeholders, never values
```

Rules:

- Keep the committed `apps/web/.env.example` and `apps/mobile/.env.example` as variable-name references with safe placeholders.
- Never commit service-role keys, database passwords, auth client secrets, or provider webhooks.
- Use `NEXT_PUBLIC_` and `EXPO_PUBLIC_` only for values safe to expose to a client bundle.
- Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for web and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for mobile. The web config accepts `NEXT_PUBLIC_SUPABASE_ANON_KEY` only as a legacy compatibility alias.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only and do not pass it into shared modules or client bundles; the current web/mobile clients do not read it.
- Each environment must point at an isolated Supabase project/database.

## Local Supabase workflow

The migration-first workflow is now represented by `supabase/migrations/0001_init.sql` and `supabase/seed.sql`:

1. Create or update an ordered SQL migration.
2. Enable RLS and define policies in the same change as a table.
3. Add constraints and indexes for the documented query paths.
4. Configure or link the Supabase project, then reset the local database and apply all migrations from zero.
5. Run the checked-in seed; it inserts only deterministic sports reference data, not Auth-linked profiles or user content.
6. Test anonymous, authenticated-owner, authenticated-non-owner, and operator access.
7. Regenerate database types if the project adopts generated types; the current web client keeps a checked-in database type snapshot.

Do not make manual dashboard changes that are absent from migrations. If a dashboard-only setting is unavoidable, document it in the relevant ADR and add a reproducible follow-up.

## Coding conventions

- TypeScript should be strict in shared and application packages.
- Keep domain contracts in `packages/domain` (or its reviewed successor) rather than copying request/response shapes into each client.
- Validate all external input at the server boundary. Client validation is for feedback, not trust.
- Use explicit names from [domain vocabulary](SSOT.md#domain-vocabulary): `listing`, `community_post`, `transaction`, and `profile` have different meanings.
- Keep server-only modules separate from client modules. Add build-time checks to prevent secret imports in Expo/browser code.
- Prefer small, composable data-access functions that expose the required authorization context.
- Make writes idempotent where retries are expected and return documented error codes.
- Do not add UI layout or design-system rules to domain docs; record approved design decisions separately.

## Testing strategy

The current baseline includes package/domain validation tests and web repository tests:

- Package-level Zod validation tests for sport-discriminated listings and profile/onboarding inputs (currently present in `packages/domain/tests`).
- Unit tests for shared IDs, pagination, error helpers, and any new contract validators remain useful follow-ups.

- Contract tests for web/server operations using authenticated and anonymous contexts.
- Database tests for foreign keys, uniqueness, publication state constraints, and RLS policy cases.
- Smoke checks for a public listing read, sign-in/session restoration, listing create/review, and any approved community/report flow.
- Web and mobile build/type checks are runnable locally; CI wiring remains a follow-up.

For every RLS policy, test at least:

```text
anonymous → public active listings/approved content only
owner     → own profile/listing/content rows
other user→ cannot read or mutate another user's private rows
operator  → only approved listing/moderation operations
```

The committed migration has RLS policies, but anonymous/owner/operator verification against a configured local or hosted Supabase project remains a setup follow-up. Do not treat a successful service-role test as proof that client access is safe.

## Branch and change workflow

Each change should have one clear outcome:

1. Update the relevant contract or ADR when behavior changes.
2. Add schema migration and tests together for data changes.
3. Run formatting, lint, typecheck, tests, and the affected app build.
4. Review generated files and environment references for accidental secrets.
5. Record unresolved decisions instead of hiding them in code defaults.

Documentation-only changes may be checked with Markdown link/reference validation and `git diff --check`; they must not modify application source as a side effect.

## Release hygiene

Before a production release exists, define:

- How web and mobile versions are coordinated.
- How Supabase migrations are promoted and rolled back.
- How environment values and auth redirect URLs are managed.
- Who can perform operator actions and how access is revoked.
- How errors, audit events, privacy requests, and incidents are retained.
- How deep links and canonical share URLs are tested on both platforms.

Until those decisions are made, there is no supported production deployment procedure.

## Troubleshooting checklist

- **No data appears:** check the Supabase project URL, environment, publication status, and RLS policy; do not disable RLS to diagnose.
- **Session disappears:** verify the platform storage/cookie adapter and auth redirect configuration; never copy a service key into the client.
- **Save repeats/duplicates:** confirm the composite unique key and idempotent mutation contract.
- **Web/mobile disagree:** compare shared schema/version and environment project IDs before changing client logic.
- **Migration works locally only:** reset from zero, verify the migration is committed, and check for dashboard-only changes.
- **Public response leaks fields:** inspect the query/view and server response shaping; RLS alone is not a substitute for a safe public projection.

## Current status

The repo now has root workspace scripts, web and mobile MVP clients, shared contracts, a Supabase migration with RLS, and a deterministic sports seed. The local validation matrix (`pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `pnpm export:mobile:web`) is passing. Remaining setup is to create/link a Supabase project, copy and fill the two app env files with public values, apply the migration and seed, configure Auth, and exercise RLS with real identities; payment, fulfillment, deployment, and CI remain outside this MVP baseline.

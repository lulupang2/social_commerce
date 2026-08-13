# ADR 001: Use Expo + Next.js + Supabase + pnpm

- **Status:** accepted as the target stack; implementation pending
- **Date:** 2026-08-13
- **Scope:** IceGear MVP application and workspace foundation

## Context

IceGear needs a mobile client, a web client, authentication, relational data with row-level authorization, and a workspace that can share contracts without duplicating them. The repository currently has an early `packages/domain` TypeScript/Zod contract package and package-local validation tests, but no root workspace, client runtime, or migration to preserve. The current task explicitly requires Expo, Next.js, Supabase, and pnpm to be represented in the architecture.

## Decision

Build the MVP as a pnpm workspace with:

- **Expo / React Native** for the mobile application.
- **Next.js** for the web application and the web/server boundary.
- **Supabase** for Auth and Postgres with RLS; use Storage or Edge Functions only when a reviewed requirement needs them.
- **pnpm** for workspace dependency management and shared scripts.

Keep the existing `packages/domain` package as the initial home for schemas, API contracts, and safe domain types, or record an ADR before moving it. Keep platform presentation code in the relevant app. Use the Supabase public client for simple RLS-protected operations and a trusted Next.js route or Supabase Edge Function for privileged/multi-step operations; the per-operation transport split remains a follow-up decision.

## Why this fits the MVP

- Expo gives one React Native codebase for the initial mobile targets while leaving native escape hatches available.
- Next.js supplies a web application and a server-side execution boundary without requiring a separate web backend on day one.
- Supabase provides a managed Postgres/Auth path and makes database authorization (RLS) part of the application boundary rather than an afterthought.
- pnpm workspaces make it practical to keep mobile/web contracts and validation logic aligned.
- The combination supports a small team starting with catalog reads, account data, and user-owned saves before adding commerce complexity.

## Consequences

### Positive

- One relational source of truth for mobile and web.
- The existing shared contract package can reduce drift between clients once the root workspace includes it.
- RLS can protect direct client data access when policies are written and tested correctly.
- A server boundary is available for secrets and privileged operations.
- The stack can defer payment, search infrastructure, queues, and seller operations until product decisions exist.

### Costs and risks

- Expo, Next.js, and Supabase each have distinct runtime/build conventions; environment handling must be explicit.
- Supabase RLS is powerful but easy to misconfigure; every table requires policy tests.
- Direct Supabase calls and Next.js/Edge APIs can drift if the transport split is not recorded in shared contracts.
- Mobile auth persistence and deep links require platform-specific setup.
- Hosted Supabase and web deployment costs, regional availability, and operational ownership need review before production.

## Security implications

- Only public Supabase configuration may enter browser or Expo bundles.
- Service-role keys and database credentials are server/CI-only.
- RLS is enabled on every application table with default-deny policies.
- Operator writes use an explicit role and an auditable server-side path.
- Public responses use safe projections; private fields are not assumed safe merely because a row is visible to a service role.

## Alternatives considered

### Separate native apps or React Native CLI

Would offer more direct native control, but adds setup and maintenance before IceGear has validated its product scope. Revisit if Expo's native constraints block a confirmed requirement.

### Next.js-only web application

Would not satisfy the mobile client requirement and would make mobile a later, potentially divergent product.

### Custom API service plus managed database/auth providers

Would provide finer backend control but creates more infrastructure and operational work than the current MVP needs. Revisit if the API boundary, workload, or compliance requirements outgrow Supabase.

### npm/Yarn workspaces

Could manage a workspace, but pnpm is the explicit package-manager decision for this product and should be the single lockfile owner.

## Follow-up decisions

1. Include `packages/domain` in the root workspace and pin Node, pnpm, Expo, Next.js, and Supabase CLI versions in the bootstrap change.
2. Decide the direct-Supabase vs Next.js route vs Edge Function boundary per operation.
3. Select auth providers, callback/deep-link scheme, and environment/hosting setup.
4. Confirm whether media, social content, seller listings, or commerce belong in the MVP.
5. Add migrations, RLS policy tests, CI checks, and secret scanning before application release.

# IceGear MVP architecture

**Status:** target architecture; the current working tree has a framework-agnostic `packages/domain` contract package, but no client or backend runtime.

This document turns the stack constraint into practical boundaries. It does not prescribe UI structure or visual design.

## System context

```text
                    ┌─────────────────────────────┐
                    │        Supabase project      │
                    │ Auth · Postgres · RLS        │
                    │ Storage (only if approved)   │
                    └──────────────┬──────────────┘
                                   │
               RLS-protected SDK   │   privileged server calls
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        │                                                     │
┌───────▼────────┐                                  ┌─────────▼────────┐
│ Expo mobile    │                                  │ Next.js web      │
│ iOS/Android    │                                  │ browser + server │
└───────┬────────┘                                  └─────────┬────────┘
        │                                                     │
        └────────────── shared contracts/types ───────────────┘
```

The diagram shows logical ownership, not a commitment to a particular hosting provider or UI route structure.

## Responsibilities

### Expo mobile

- Render the mobile client and invoke shared contracts.
- Use Supabase Auth through a platform-appropriate secure session store.
- Use only public Supabase configuration in the bundle.
- Call RLS-protected Supabase operations directly only when the operation is simple and safe; use the approved server boundary for privileged or multi-step work.
- Handle offline/session edge cases without assuming that a client-side decision is authorization.

### Next.js web

- Render the web client and provide canonical public URLs for listing/community references.
- Manage web auth cookies/session integration using the selected Supabase SSR pattern.
- Expose route handlers only for contracts that need a stable cross-client server boundary.
- Keep service credentials in server-only modules and deployment secrets.
- Generate or consume metadata for public listing/community links without leaking private fields.

### Supabase

- Supabase Auth owns credential and identity lifecycle.
- Postgres is the source of truth for catalog, profile, and user-owned relations.
- RLS enforces access at the data boundary for every application table.
- Storage is optional and must remain private by default until media requirements are approved.
- Edge Functions are an optional location for operations that should run close to the database or outside Next.js deployment; the selection is unresolved.

### Shared packages

The current `packages/domain` package is the first shared contract layer. Keep it small and framework-agnostic rather than duplicating domain rules in each app:

- Zod validators and TypeScript types for currently modeled sports, listings, seller/transaction/community/report records, and profile/onboarding inputs.
- Future schema validators for IDs, pagination, API payloads, and write inputs.
- API error/pagination shapes when the transport contract is implemented.
- Non-secret constants such as status enums and supported protocol versions.

Client-specific presentation code, secrets, database admin clients, and platform storage adapters do not belong in the shared package.

## Request and data flow

### Public catalog read

1. A client requests the public listing index or a listing/community resource.
2. The request uses the public Supabase client or a Next.js route handler, according to the endpoint decision.
3. The database query filters to active/visible listings and approved community content.
4. RLS independently prevents private rows or columns from being returned.
5. The client receives a stable, versioned response shape.

### Authenticated save

1. The client obtains a Supabase Auth session.
2. The save mutation carries the session context; it does not trust a client-supplied owner ID.
3. The database enforces ownership and any approved uniqueness key, making safe retries idempotent.
4. RLS permits the current user to insert/delete only their own relation (for example, a future save or reaction).
5. A later list operation returns only relations allowed by the product contract.

### Privileged publication

1. An operator session reaches a server-side route or function.
2. The server validates the session, role, input, and listing/community state transition.
3. The operation writes listing or moderation data and an audit event in a transaction where possible.
4. Public reads see the new state only when the transition succeeds.
5. The service key, if needed, is loaded only in the trusted runtime and is never sent to the client.

## Repository boundary

The target repository shape is:

```text
apps/mobile/       Expo app
apps/web/          Next.js app
packages/domain    existing framework-agnostic domain types and Zod schemas
packages/config    shared tool configuration (optional)
supabase/migrations ordered SQL migrations and RLS
supabase/functions optional Edge Functions
docs/              product and engineering contracts
```

The root `package.json` and `pnpm-workspace.yaml` are not present yet. The first workspace bootstrap should include the existing `packages/domain` package without moving documentation or changing the product scope silently.

## Trust boundaries

| Boundary | Untrusted input | Required control |
| --- | --- | --- |
| Mobile/web client → Supabase | IDs, filters, payloads, session state | RLS, schema validation, database constraints |
| Browser → Next.js route | Headers, cookies, JSON, query strings | Session verification, input validation, rate limits where needed |
| Server → Supabase admin API | Internal job data and credentials | Server-only modules, least privilege, audit logging |
| User upload → Storage | File content, metadata, filename | Size/type checks, private bucket, safe object path, signed access |
| Third-party provider → webhook | Replayable/untrusted HTTP request | Signature verification, idempotency, event logging; only when a provider is selected |

## Availability and failure behavior

The MVP should prefer explicit, recoverable errors over hidden retries:

- A public read can return a bounded empty result for no matches.
- A missing or unauthorized resource should use the documented not-found behavior.
- Auth expiry should prompt the client to refresh or sign in again, not retry forever.
- Writes should be idempotent where a user can safely retry (for example, saves).
- A failed privileged operation must not leave a partially published item.
- External integrations and background jobs are future concerns; no queue or retry provider is selected.

## Observability and audit

Baseline logging should include request correlation ID, operation name, status, latency, and non-sensitive actor type. Do not log access tokens, service keys, passwords, full private profiles, or uploaded content. Privileged catalog changes need an audit record with actor, target, action, and timestamp. Error reporting tooling and retention are unresolved and must go through a privacy review.

## Scaling posture

Start with Postgres queries and indexes that reflect the MVP listing/profile/community read paths. Avoid premature search infrastructure or denormalized feeds. Add a dedicated search/indexing system, caching, queues, or materialized views only when measurements and a product decision justify the operational cost.

## Open architecture decisions

- Choose direct Supabase calls vs Next.js route handlers vs Edge Functions per operation.
- Choose hosting and preview strategy for Next.js and the Supabase project.
- Decide whether media is in MVP and define Storage buckets/policies.
- Decide auth providers, refresh/deep-link behavior, and deletion semantics.
- Decide whether a catalog item has one source or multiple listings.
- Define rate limiting, abuse controls, and audit retention before social writes expand.

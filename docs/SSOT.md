# IceGear MVP — single source of truth

**Status:** MVP implementation baseline shipped; Supabase project, environment, and seed setup are still required for end-to-end data flows.

**Last reviewed:** 2026-08-13

This document is the short, durable reference for the IceGear MVP. It records what is known, what is being proposed so the team can build, and what still needs a decision. It intentionally does not prescribe visual design, screen layout, navigation style, copy, or interaction details.

## How to read this document

- **Confirmed** means it is required by the current repository brief or is an observed repository fact.
- **Proposed** means a practical working assumption that can be implemented, but needs product validation.
- **Unresolved** means the team must decide it; downstream docs must not silently turn it into a product promise.

When a proposal becomes a decision, update this file and the relevant ADR or supporting document in the same change.

## Product statement and scope

### Confirmed

IceGear is the working product name for an MVP in the social-commerce space. The implementation uses Expo, Next.js, Supabase, and pnpm. The repository now includes the root workspace and lockfile, a Next.js web MVP, an Expo Router mobile MVP, shared `packages/domain` contracts with Zod validation, Supabase migrations and seed data, and public environment examples. The Supabase project itself and its runtime environment values are intentionally not committed.

### Proposed product job

IceGear helps people discover, list, and discuss winter-sports gear. The current domain contract names **ski** and **hockey** as supported sports and models seller listings, profiles/onboarding, community posts/comments/reactions, reports, and a transaction lifecycle. The MVP should make the listing, profile, and community foundations reliable before it takes on payment and fulfillment complexity.

The current sports boundary is ski and hockey. The domain package already proposes equipment categories, conditions, currencies, location, media metadata, and seller types, but the product owner still needs to approve which fields and regions are release-critical. Whether all modeled transaction and community states ship in the first release remains unresolved.

### Proposed MVP scope

The following is the smallest useful product slice proposed for validation, based on the current domain contract:

1. An authenticated user can complete onboarding and maintain the minimum profile data needed for the product, including preferred sport(s) and optional skill level.
2. Users can browse and inspect active ski or hockey listings with title, description, condition, price/currency, images, location, tags, and sport-specific details where available.
3. An authenticated seller can submit a listing through a validated contract; listing review/publication is controlled by an approved operator path.
4. Users can publish or consume community posts and comments only if the moderation/reporting policy is approved; the domain package currently models discussion, question, guide, review, event, and announcement post types plus reactions.
5. A user can report an allowed target using a documented reason set; a trusted operator can review the report.
6. Every write has an authenticated owner or an explicitly documented operator role, and all persisted data is protected by Supabase RLS.

Transaction records may be modeled for a later handoff/reservation flow, but no payment provider or fulfillment automation is part of this proposal. Saves/collections, follows, messaging, and recommendation feeds are not currently represented by the domain package and remain unresolved.

### Non-MVP boundary

The following are explicitly outside the first implementation unless product re-scopes the MVP:

- Payment capture, checkout, refunds, taxes, shipping, fulfillment, and returns.
- Seller payouts, commissions, identity verification, and marketplace dispute handling.
- Real-time chat, direct messaging, activity feeds, and push-notification campaigns.
- Community content without a moderation/reporting policy and operator workflow.
- Recommendation or ranking models that require behavioral data or machine learning.
- Currencies, regions, and inventory behavior beyond the approved first release.
- Native-only or web-only features that make the two clients behave as separate products.
- A bespoke design system, visual layout, or navigation model. Those are design decisions and are not specified here.

## Personas

These are working personas, not a claim that research has been completed.

| Persona | Goal | MVP need | Guardrail |
| --- | --- | --- | --- |
| Gear explorer/buyer | Find gear that matches a sport, need, or budget | Public listing discovery and item facts | Do not require an account for public reading unless a later privacy decision requires it |
| Seller/listing owner | Describe and offer gear accurately | Validated listing creation and listing state visibility | Do not assume seller payouts, shipping, or marketplace guarantees |
| Enthusiast/community participant | Share knowledge and ask or answer questions | Approved post/comment/reaction flow | Do not ship user-generated content without moderation and report handling |
| Listing/operator | Keep listing data and publication state accurate | Authenticated review, activate/archive/remove, and correction path | Operator actions must be auditable and server-side/RLS protected |
| Moderator/support operator | Handle reports or safety issues | Role-restricted report review and resolution | Exact roles, queue, and retention policy are unresolved |

The first release is primarily for the gear explorer and listing owner. Community participants are conditional on the moderation decision; operator and moderator personas are operational concerns rather than a commitment to an admin application.

## User flows

The flows describe business outcomes and data boundaries, not screens or layout.

### Browse and inspect an active listing — proposed MVP

1. A visitor requests a listing page or sport/category result.
2. The service returns only active/visible listings and the fields allowed by policy.
3. The visitor requests a listing by stable ID or slug.
4. The service returns the listing, its public media metadata, seller summary as approved, and sport-specific detail fields.
5. If the listing is missing, removed, or not visible in the caller's scope, the service returns the same not-found behavior; it must not disclose private records.

### Create and review a listing — proposed MVP

1. A seller signs in through Supabase Auth and completes the minimum profile/onboarding requirements.
2. The client submits a sport-discriminated listing payload.
3. Shared validation checks category, condition, price/currency, images, location, and sport-specific details.
4. The server assigns the seller subject, creates a draft or review-pending listing, and records ownership.
5. An approved operator reviews and transitions the listing to active, or returns/removes it according to the moderation policy.

### Complete profile/onboarding — proposed MVP

1. A user authenticates through an enabled Supabase Auth provider.
2. The client collects display name and at least one preferred sport, with optional username, bio, location, avatar, and skill level subject to privacy review.
3. The server associates the profile with the authenticated subject and validates self-service changes.
4. The user can read/update only their permitted profile fields.

### Participate in community content — conditional MVP

1. An authenticated user submits an approved post or comment type.
2. The service validates ownership, content length, and target visibility.
3. Reactions and edits/deletes follow an explicit moderation policy.
4. A user submits a report with a documented reason when content or a listing is unsafe or inappropriate.
5. A moderator/operator reviews and resolves the report with an auditable action.

### Share a stable listing/community reference — proposed MVP

1. A user obtains a canonical listing or post URL/ID from a visible resource.
2. The platform's native or web sharing mechanism may be used; the implementation must not depend on a particular UI.
3. A recipient can open the public resource without inheriting the sender's session or private data.

### Operator publication — proposed MVP

1. An operator authenticates with an approved operator role.
2. A server-side/admin operation validates the listing or community moderation transition.
3. RLS and server authorization prevent ordinary users from changing catalog/listing or publication fields.
4. The operation is logged with actor and timestamp information sufficient for support and audit.

### Account lifecycle — proposed MVP

1. A user creates or signs into an account with the enabled Supabase Auth provider(s).
2. A profile row is created or reconciled from the authenticated subject.
3. The user can update only fields explicitly allowed for self-service.
4. Sign-out revokes the local session and removes access to account-only operations.

### Deferred payment/fulfillment flow — explicitly not committed

Listing → offer/reservation → checkout → payment → order → fulfillment is a future flow, not an MVP contract. Do not create payment UI, provider webhooks, payout logic, or shipping automation until the transaction semantics, payment provider, legal requirements, and regional scope are decided.

## Domain vocabulary

Use these terms consistently in code, APIs, and support material.

| Term | Meaning | Notes |
| --- | --- | --- |
| IceGear | The product and its services | Avoid using it as a table name unless needed |
| Sport | A supported gear/community domain; currently `ski` or `hockey` in the domain package | Adding sports is a product/schema decision |
| Listing | A seller-owned offer/record for a piece of gear | Distinct from a future canonical catalog item |
| Catalog item | A future canonical item independent of a seller offer | Not present in the current domain package; do not assume it exists |
| Seller | An individual, shop, or brand account associated with a listing | Marketplace verification/payout semantics are unresolved |
| Active | A listing visible and available under the selected policy | Status transitions are not UI decisions |
| Save | A future user-owned relation marking a listing for later retrieval | Not present in the current domain package; do not call it a purchase |
| Community post | A typed user-authored item such as discussion, question, guide, review, event, or announcement | Requires moderation/reporting controls |
| Reaction | A typed signal on a community post; current domain values are like/helpful/celebrate | Exact counts, uniqueness, and abuse controls are unresolved |
| Profile | Application-owned, non-auth identity data linked to `auth.users.id` | Authentication credentials remain in Supabase Auth |
| Operator | Trusted staff/service role allowed to manage catalog data | Exact role claims are unresolved |
| Moderator | Trusted person/service allowed to review user-generated content or reports | Not needed until social content is enabled |
| Report | A user/operator submission that flags content or data | Candidate future entity; policy is unresolved |
| Transaction | A future or provisional record relating a buyer, seller, listing, amount, and lifecycle status | Domain status values exist, but payment/fulfillment behavior is deferred |
| Public data | Data safe to return without a user session | Must be enforced by query and RLS, not just client behavior |
| Private data | Data visible only to its owner or an explicitly authorized role | Default for profiles, saves, reports, and operational notes |

## Architecture decisions

### Confirmed stack

- **pnpm** manages the workspace, dependency graph, and shared scripts.
- **Expo / React Native** is the target mobile client.
- **Next.js** is the target web client and server-side web boundary.
- **Supabase** is the target backend platform: Postgres, Auth, Storage if media is enabled, and server-side functions where appropriate.

The rationale and consequences are recorded in [ADR 001 — stack](adr/001-stack.md).

### Proposed boundaries

```text
Expo mobile ─────┐
                 ├─ shared types/validation ── Supabase Auth + RLS-protected data
Next.js web ─────┘             │
                               └─ Next.js route handlers or Supabase Edge Functions
                                  for privileged/multi-step operations
```

Clients may use the Supabase public client for authenticated, RLS-protected reads and simple user-owned writes. Operations that combine records, use secrets, mutate publication state, call third-party services, or need durable idempotency should cross a server-side boundary. The exact split between Next.js route handlers and Supabase Edge Functions is unresolved; whichever is chosen must preserve the same API and authorization rules.

### Current workspace shape

```text
apps/
  mobile/       # Expo application
  web/          # Next.js application
packages/
  domain/       # framework-agnostic types/validation contracts
supabase/
  migrations/   # ordered SQL migrations and RLS policies
  seed.sql      # deterministic sports reference data
docs/
```

The web currently reads through a server-scoped public Supabase client, while mobile reads and creates listings through its public client; both rely on RLS. There is no committed Supabase `config.toml`, hosted project link, or service-role client; those belong to local/deployment setup and trusted server tooling.

## Security and RLS principles

1. **Default deny.** Enable RLS on every application table and add only policies required by a documented use case.
2. **Use the database subject.** Owner policies compare ownership to `auth.uid()` (or a narrowly scoped, reviewed role claim), never to a client-provided user ID.
3. **Public means approved and visible.** Anonymous reads may see only explicitly public fields on active listings and approved community content. Draft, review-pending, removed, deleted, and operational data must not leak through alternate queries, counts, or error messages.
4. **No service key in clients.** A Supabase service-role key, database password, payment secret, webhook secret, or admin credential may run only in a trusted server environment. It must never be prefixed with a client-exposed variable name or bundled into Expo/Next browser code.
5. **Authorization is server and database defense in depth.** Route handlers/functions validate the session and role, while RLS remains effective if a client or route is misconfigured.
6. **Minimize personal data.** Keep authentication in Supabase Auth; store only product-required profile fields. Avoid collecting address, payment, contact, or precise location data until a reviewed requirement exists.
7. **Validate at the boundary.** Validate shape, length, enum values, IDs, URLs, and state transitions on the server and in database constraints where practical. Treat all client values as untrusted.
8. **Safe media.** If Supabase Storage is used, keep buckets private by default, use signed URLs for restricted media, validate MIME type/size server-side, and give object paths an ownership or publication policy.
9. **Auditable privileged actions.** Publication, moderation, and data corrections need actor/timestamp records. Never grant broad admin access to ordinary user sessions.
10. **Avoid side-channel leaks.** Use consistent not-found behavior for records a caller cannot see, and do not expose internal error details, stack traces, or provider credentials.

RLS policies must be tested with anonymous, ordinary authenticated, owner, and operator identities before a migration is considered complete. See [development.md](development.md) and [data-model.md](data-model.md).

## Environment variables

Names below describe the current environment contract. Only the checked-in example files are present; do not commit runtime values.

| Variable | Consumer | Sensitivity | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Next.js browser/server | Public configuration | Supabase project URL for the web client |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Next.js browser/server | Public configuration | Supabase publishable/anon key; constrained by RLS |
| `EXPO_PUBLIC_SUPABASE_URL` | Expo | Public configuration | Supabase project URL for mobile |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Expo | Public configuration | Supabase publishable/anon key; constrained by RLS |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Next.js compatibility alias | Public configuration | Optional legacy web alias; publishable key is preferred and used in the example |
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted server/CI only | Secret | Privileged operations/migrations where explicitly required; never ship to clients |
| `SUPABASE_DB_URL` | Local tooling/CI only | Secret | Migration or inspection connection when the Supabase CLI cannot supply it |
| `NEXT_PUBLIC_SITE_URL` | Next.js | Public configuration | Canonical web origin for links and auth callbacks |
| `EXPO_PUBLIC_WEB_URL` | Expo | Public configuration | Canonical web origin for share/deep-link fallbacks |
| `SUPABASE_AUTH_REDIRECT_URL` | Auth setup/server | Configuration | Approved callback origin(s); exact provider setup is unresolved |
| `SENTRY_DSN` | Optional clients/server | Sensitive configuration | Error reporting, only after privacy review; not required for MVP baseline |

Public keys are not authorization. Every environment must point at its own Supabase project, and production values must be injected by the deployment system or local secret manager. The web and mobile client code only reads the public URL and publishable key; no service-role key is read by or bundled into either client. The exact hosting provider, callback URLs, and whether Sentry is used are unresolved.

## Current implementation status

Observed in the repository at the date above:

- **Implemented:** Root pnpm workspace metadata and lockfile; the shared `packages/domain` ski/hockey listing and profile contracts with Zod validation/tests; the web MVP for public marketplace listing browse/detail and health routes; the mobile MVP for active-listing browse/detail and validated draft-listing creation; public-key-only Supabase clients for web and mobile; and `supabase/migrations/0001_init.sql` with RLS plus deterministic `supabase/seed.sql` sports data.
- **Validated:** `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`, and `pnpm export:mobile:web` complete successfully. Web and mobile builds render an intentional setup state when public Supabase values are missing.
- **Still required for a connected environment:** Copy `apps/web/.env.example` to `apps/web/.env.local` and `apps/mobile/.env.example` to `apps/mobile/.env`, fill in each environment's Supabase URL and publishable key, link or start a Supabase project, apply the migration, and run the seed. Auth users/profiles and real listing fixtures are not checked into the repository.
- **Not in this MVP baseline:** Payment/checkout, fulfillment, payouts, production deployment/CI, analytics, and other future or conditional community/transaction workflows described by the domain and schema contracts.
- **Implication:** The client/domain/schema integration is shipped, but data availability and authenticated writes remain dependent on Supabase project setup, Auth configuration, and RLS verification in each environment.

## Unresolved decisions

These questions are intentionally visible rather than guessed:

| Area | Decision needed | Why it matters |
| --- | --- | --- |
| Product taxonomy | Ski and hockey are currently modeled; which categories, attributes, conditions, and regions launch? | Determines listing schema, search, validation, and seed data |
| Commerce model | Is the current seller/listing model a peer marketplace, single seller, or catalog/affiliate experience? | Determines listing ownership, order semantics, payments, payouts, and legal scope |
| Social feature | Which current post/comment/reaction/report contracts are in MVP, and are saves/collections needed? | Determines moderation, abuse controls, privacy, and product metrics |
| Identity | Which Supabase Auth providers and account recovery rules are enabled? | Determines client flows, callback URLs, and support procedures |
| Listing/community operations | Who can create/edit/activate records and how are corrections/reports reviewed? | Determines role claims, audit records, moderation, and operator tooling |
| Media | Are images required in MVP, and who owns/approves uploads? | Determines Storage buckets, transformations, copyright policy, and RLS |
| API boundary | Which operations are direct Supabase calls vs Next.js route handlers vs Edge Functions? | Determines deployment, generated clients, secrets, and tests |
| Search | Postgres search, hosted search, or a later feature? | Determines indexes, ranking, costs, and data synchronization |
| Environments | Where do web, mobile builds, Supabase projects, and preview deployments run? | Determines variable injection and release process |
| Privacy/retention | What profile, telemetry, and content-retention rules apply? | Determines schema, consent, deletion, and support procedures |

## Supporting documents

- [Architecture](architecture.md) — system boundaries, data flow, and operational concerns.
- [Data model](data-model.md) — proposed entities, constraints, indexes, and RLS ownership.
- [Development](development.md) — local setup, workflow, checks, and release hygiene.
- [API contracts](api-contracts.md) — proposed cross-client operations and response/error conventions.
- [ADR 001 — stack](adr/001-stack.md) — why Expo + Next.js + Supabase + pnpm is the target stack.

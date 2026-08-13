# IceGear MVP data model

**Status:** proposed relational model; migrations do not exist yet.

The current `packages/domain` contract is the strongest implementation evidence in the repository. It models ski and hockey sports, seller-owned listings, sellers and transactions, community posts/comments/reactions, reports, and profiles/onboarding. The tables below turn those contracts into a Supabase/Postgres starting point; they do not imply that every modeled lifecycle ships in the first release.

## Modeling rules

- Use UUIDs for public identifiers unless a reviewed requirement favors another key.
- Store timestamps as `timestamptz` in UTC and expose ISO-8601 values in APIs.
- Keep `auth.users` as the identity source; application tables reference its UUID and do not store passwords.
- Use explicit status fields and database constraints for state transitions.
- Use a constrained `sport` value (`ski`, `hockey`) until product approves more sports.
- Keep user-entered listing details in a validated shape. JSONB is acceptable for sport-specific fields initially; normalize high-value search fields only after measurements.
- Add indexes for documented query paths only; measure before adding search infrastructure.
- Enable RLS on every application table, including tables whose first query is server-side.

## Identity and profile entities

### `profiles`

One application profile per Supabase Auth subject. The current domain contract requires a display name for profile input and at least one preferred sport for onboarding.

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | PK; application profile ID |
| `user_id` | `uuid` | Unique FK to `auth.users.id`; server/trigger assigned |
| `username` | `text` | Optional; lower-case and format-constrained if enabled |
| `display_name` | `text` | Required; length constrained |
| `bio` | `text` | Optional; length constrained |
| `avatar_path` | `text` | Optional; only if profile media is approved |
| `location` | `jsonb` | Optional; minimize precision/PII and validate shape |
| `preferred_sports` | `text[]` | Onboarding requires at least one approved sport |
| `skill_level` | `text` | Optional; current values beginner/intermediate/advanced/expert |
| `created_at` | `timestamptz` | Server default |
| `updated_at` | `timestamptz` | Server-maintained |

RLS: a user may read/update their own profile. Public profile visibility is unresolved and should be denied by default. A trigger or server operation may create the row after signup, but the exact lifecycle must be chosen and tested.

### `seller_profiles` (conditional extension)

The domain contract models seller types `individual`, `shop`, and `brand`. Decide whether seller data is a role/extension on `profiles` or a separate table before migration.

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | PK; seller identity used by listings |
| `profile_id` | `uuid` | Unique FK to `profiles.id` if one user owns one seller account |
| `account_type` | `text` | Constrained seller type |
| `verified` | `boolean` | Server/operator controlled; do not expose as a trust guarantee without policy |
| `created_at` | `timestamptz` | Server default |

Seller verification, multiple seller accounts, legal identity, payouts, and seller self-service onboarding are unresolved. Do not store legal/payment data in this table until those requirements exist.

## Marketplace/listing entities

### `listings`

A seller-owned record for a piece of ski or hockey gear. This is the current domain contract's primary marketplace entity; it is distinct from a future canonical catalog item.

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `seller_id` | `uuid` | FK to the selected seller/profile identity |
| `sport` | `text` | Constrained to `ski` or `hockey` for the current contract |
| `category` | `text` | Current values: equipment, apparel, protective_gear, accessories, parts, other |
| `status` | `text` | Current values: draft, pending_review, active, reserved, sold, archived, removed |
| `condition` | `text` | Current values: new, like_new, good, fair, poor |
| `title` | `text` | Required, length constrained |
| `description` | `text` | Required, length constrained and sanitized if rich text is allowed |
| `price_amount` | `numeric` | Non-negative; precision/scale must be decided |
| `currency` | `char(3)` | Upper-case ISO code; current contract examples include USD/CAD/EUR/GBP/JPY/KRW but the release set is unresolved |
| `location` | `jsonb` | Optional string/object in current contract; minimize precise location |
| `tags` | `text[]` | Optional; each value length/count constrained |
| `sport_details` | `jsonb` | Validated by the sport-discriminated domain schema |
| `is_negotiable` | `boolean` | Optional marketplace behavior; release decision needed |
| `shipping_available` | `boolean` | Optional; not a fulfillment commitment |
| `local_pickup_available` | `boolean` | Optional; safety/location policy required |
| `created_at` | `timestamptz` | Server default |
| `updated_at` | `timestamptz` | Server-maintained |

The domain contract's sport details currently include ski discipline/equipment/measurements and hockey format/equipment/position/handedness/measurements. Keep these fields behind shared validation; do not accept arbitrary detail keys as trusted business data merely because the current Zod schema is forward-compatible.

RLS: a seller can create/update/delete only their own draft or review-pending listings. Public/authenticated readers may see only `active` listings and approved public fields. Operators can perform reviewed transitions. `reserved`, `sold`, `archived`, and `removed` semantics need a state-transition policy before production.

### `listing_media` (conditional)

Media metadata associated with a listing if images are in the MVP.

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `listing_id` | `uuid` | FK to `listings.id` |
| `storage_path` | `text` | Server-generated; never trust a client path |
| `alt_text` | `text` | Required for published media |
| `sort_order` | `integer` | Non-negative |
| `created_at` | `timestamptz` | Server default |

Keep the Storage bucket private by default. A server operation can return signed URLs or a reviewed public URL only for active listing media. Exact image formats, transforms, limits, and copyright ownership are unresolved.

### `catalog_items` (future, do not assume)

A canonical gear record independent of a seller listing may eventually reduce duplication across sellers. It is not present in the current domain package. Do not add it as a placeholder until the team decides whether IceGear is a peer marketplace, catalog/affiliate experience, or both.

## Transaction entities (deferred)

### `transactions`

The current domain contract includes a transaction type with buyer, seller, listing, amount, payment method, fulfillment status, shipping address, and timestamps. That type is a planning contract only; it is not an authorization to build checkout or payment.

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `listing_id` | `uuid` | FK to `listings.id` |
| `buyer_id` | `uuid` | FK to `profiles`/auth subject |
| `seller_id` | `uuid` | FK to seller identity; must match listing owner |
| `amount` | `numeric` | Immutable agreed amount once a transaction exists |
| `currency` | `char(3)` | Must be explicit; no implicit conversion |
| `status` | `text` | Current contract values include pending, accepted, payment_pending, paid, fulfilling, shipped, completed, cancelled, disputed, refunded |
| `fulfillment_status` | `text` | Current values include not_started, pickup_scheduled, ready_for_pickup, shipped, delivered, complete |
| `payment_method` | `text` | Current values card, cash, bank_transfer, other; provider/security review required |
| `shipping_address` | `jsonb` | Sensitive PII; defer until shipping/legal requirements exist |
| `created_at` / `updated_at` | `timestamptz` | Server-maintained |
| `completed_at` | `timestamptz` | Nullable; state-transition controlled |

Do not migrate this table until the seller model, payment provider, currency/region, tax, fulfillment, refund, and webhook rules are known. If a pre-payment reservation flow is approved, model it separately from a settled payment and name the semantics explicitly.

## Community and moderation entities (conditional MVP)

### `community_posts`

User-authored content. The current domain values are discussion, question, guide, review, event, and announcement.

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `author_id` | `uuid` | FK to `profiles`/auth subject |
| `sport` | `text` | Optional approved sport |
| `type` | `text` | Constrained post type |
| `title` | `text` | Required/length constrained according to product decision |
| `body` | `text` | Required/length constrained and sanitized |
| `tags` | `text[]` | Optional, bounded |
| `status` | `text` | Proposed moderation state; exact values unresolved |
| `created_at` / `updated_at` | `timestamptz` | Server-maintained |

### `community_comments`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `post_id` | `uuid` | FK to `community_posts.id` |
| `author_id` | `uuid` | FK to `profiles`/auth subject |
| `body` | `text` | Required/length constrained and sanitized |
| `status` | `text` | Proposed moderation state; exact values unresolved |
| `created_at` / `updated_at` | `timestamptz` | Server-maintained |

### `community_reactions`

The current contract allows `like`, `helpful`, and `celebrate` reactions. Decide whether one user may have one reaction per post or one per kind before defining the primary/unique key.

| Column | Type | Rules |
| --- | --- | --- |
| `post_id` | `uuid` | FK to `community_posts.id` |
| `user_id` | `uuid` | FK to `auth.users.id` |
| `kind` | `text` | Constrained reaction kind |
| `created_at` | `timestamptz` | Server default |

### `reports`

The current contract supports targets listing, profile, post, comment, and message, with reasons spam, scam, counterfeit, prohibited_item, harassment, hate_speech, unsafe_meetup, copyright, and other. `message` is deferred with messaging.

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `reporter_id` | `uuid` | FK to auth subject |
| `target_type` | `text` | Constrained target type; exclude deferred targets until enabled |
| `target_id` | `uuid` | Opaque target reference |
| `reason` | `text` | Constrained reason |
| `details` | `text` | Optional, length constrained; may contain sensitive data |
| `status` | `text` | Current values pending, open, under_review, resolved, dismissed |
| `created_at` / `resolved_at` | `timestamptz` | Server-maintained |
| `resolution_note` | `text` | Operator-only; retention policy required |

Reports need rate limits, abuse controls, moderator roles, target visibility rules, and retention/deletion semantics before community content is public.

## Future user relations

`saves`, follows, and collections are common social-commerce relations but are not present in the current domain package. Add only after product confirms the behavior. If saves ship, use a unique `(user_id, listing_id)` key and owner-only RLS; never represent a purchase as a save.

## Relationships

```text
auth.users 1 ---- 0..1 profiles
profiles 1 ------ 0..1 seller_profiles (conditional)
seller_profiles 1 ---- * listings
profiles 1 ------ * community_posts
community_posts 1 ---- * community_comments
profiles * ------ * community_posts through community_reactions
profiles 1 ------ * reports
listings 1 ------ * listing_media (conditional)
listings 1 ------ * transactions (deferred)
```

## Constraints and indexes

Minimum constraints for the candidate profile/listing/community model:

- `profiles.user_id` is unique and references `auth.users(id)` with a reviewed delete behavior.
- `listings.sport`, `category`, `status`, and `condition` use constrained values, not arbitrary client text.
- `listings.price_amount >= 0`; currency is a three-letter upper-case code; numeric precision/scale is decided before migration.
- A listing's `seller_id` must reference an authorized seller identity.
- `listing_media.sort_order` is non-negative and bounded.
- Community body/title fields have server-side length limits and a reviewed sanitization strategy.
- Reaction uniqueness follows the chosen product rule and is enforced in the database.
- `updated_at` is maintained consistently by a trigger or trusted write path.

Candidate indexes:

- `listings(status, sport, updated_at desc)` for public browsing.
- `listings(seller_id, created_at desc)` for a seller's listings.
- `listings(category, condition)` only if those filters are in the first release.
- `listing_media(listing_id, sort_order)` if media is enabled.
- `community_posts(status, created_at desc)` for moderated feeds.
- `community_comments(post_id, created_at)` for post detail.
- `reports(status, created_at)` for operator triage.
- `transactions(buyer_id, created_at desc)` and `(seller_id, created_at desc)` only when transactions are approved.

Do not add an index on every possible filter before taxonomy/search requirements are decided.

## RLS policy matrix

The policy names are illustrative; actual SQL should be reviewed with each migration.

| Table | Anonymous | Authenticated owner/user | Operator/moderator |
| --- | --- | --- | --- |
| `profiles` | No access by default | Own row only | Explicit support access only if needed |
| `seller_profiles` | Approved public summary only | Own seller record | Explicit verification actions |
| `listings` | Active public fields only | Own draft/review listings; active public reads | Create/update/review transitions per role |
| `listing_media` | Active media only if approved | Own draft media | Manage per listing/operator role |
| `transactions` | No access | Buyer/seller rows only after transaction flow is approved | Audited support access only |
| `community_posts/comments` | Approved public content only | Own writes; approved public reads | Moderation actions only |
| `community_reactions` | Approved aggregate/public subset only | Own reaction rows | No broad access by default |
| `reports` | No access | Create/read only where policy permits | Triage/resolve by moderator role |

Supabase table policies do not replace safe response shaping. Use views or server-side projections when a row contains both public and operational fields. Never allow a client to set `seller_id`, `author_id`, `reporter_id`, or operator fields as an authority signal.

## Deletion and retention

The product has not decided whether accounts can be hard-deleted, anonymized, or retained for audit. Until decided:

- Do not store unnecessary PII, especially shipping addresses and precise location.
- Use archive/remove states for listings and moderation outcomes rather than destructive deletes by default.
- Define a reviewed foreign-key behavior for profile deletion before migrations.
- Record data-retention assumptions in an ADR when privacy requirements arrive.

## Migration discipline

Every schema change should be an ordered, reviewed SQL migration. A migration is incomplete until it includes constraints, indexes, RLS enablement, policies, and a test plan for anonymous/owner/operator access. Generated TypeScript types, if used, must be regenerated from the target schema and committed or reproducibly generated by CI according to the eventual workflow. Domain package schemas and database constraints must be kept intentionally aligned; neither layer should silently broaden authorization.

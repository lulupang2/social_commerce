# IceGear MVP API contracts

**Status:** proposed logical contracts; `packages/domain` supplies validation/types, but no HTTP route, Supabase function, or client integration exists yet.

These contracts are transport-neutral enough to support either direct Supabase client calls or a Next.js/Edge Function boundary. The team must choose the transport per operation without changing the semantics or authorization rules.

## Contract rules

- All timestamps are UTC ISO-8601 strings.
- IDs are opaque UUID strings to clients.
- A client never supplies the authenticated owner ID as an authority signal; the server derives it from the session.
- Public reads return only active/public listing fields and approved community content.
- Account-only operations require a valid Supabase Auth session.
- Operator/moderator operations require an explicitly verified role.
- JSON request/response bodies use `camelCase`; database columns may use `snake_case`.
- Unknown fields are rejected or ignored according to the shared validator; choose one behavior and test it consistently.
- Mutations that can be retried accept an idempotency key or use a database uniqueness constraint.

## Current domain vocabulary

The existing domain package currently defines these contract values:

- Sports: `ski`, `hockey`.
- Listing categories: `equipment`, `apparel`, `protective_gear`, `accessories`, `parts`, `other`.
- Listing conditions: `new`, `like_new`, `good`, `fair`, `poor`.
- Listing states: `draft`, `pending_review`, `active`, `reserved`, `sold`, `archived`, `removed`.
- Seller types: `individual`, `shop`, `brand`.
- Community post types: `discussion`, `question`, `guide`, `review`, `event`, `announcement`.
- Reaction kinds: `like`, `helpful`, `celebrate`.
- Report reasons: `spam`, `scam`, `counterfeit`, `prohibited_item`, `harassment`, `hate_speech`, `unsafe_meetup`, `copyright`, `other`.

These are implementation evidence, not a promise that every enum value is public or in the first release. The API must expose only the approved subset and should preserve forward compatibility when values are added.

## Authentication/session contract

Supabase Auth owns signup, sign-in, refresh, and sign-out. The web client may use secure HTTP-only cookies through the selected Next.js SSR integration; Expo must use a platform-appropriate secure storage adapter. The exact providers, callback URLs, and deep-link scheme are unresolved.

For a server request, the effective identity is:

```json
{
  "subjectId": "uuid from the verified Supabase session",
  "role": "authenticated"
}
```

`subjectId` and `role` above are derived values, not request body fields. A service role is never accepted from a client header or query string.

## Shared response shapes

### Listing summary

```json
{
  "id": "2efc2d31-1a0d-4c48-8f8e-11e4c26f12ef",
  "sellerId": "7acb62c3-7b8e-414e-a06e-e68d92a0e6de",
  "sport": "ski",
  "category": "equipment",
  "status": "active",
  "condition": "good",
  "title": "All-mountain skis",
  "description": "Skis used for one season.",
  "price": { "amount": 350, "currency": "USD" },
  "images": [],
  "location": { "city": "Example City", "countryCode": "US" },
  "tags": [],
  "createdAt": "2026-08-13T00:00:00.000Z",
  "updatedAt": "2026-08-13T00:00:00.000Z"
}
```

The seller projection, location precision, image URLs, and public status mapping require product/privacy decisions. The example is illustrative and must not be seeded as real product data.

### Page envelope

```json
{
  "items": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

Use an opaque cursor for stable pagination. Do not expose database offsets as a durable public contract. A page size must be bounded server-side; the exact default and maximum are unresolved.

### Error envelope

```json
{
  "error": {
    "code": "validation_error",
    "message": "The request could not be accepted.",
    "requestId": "req_opaque"
  }
}
```

`message` is safe for the caller and must not contain SQL, stack traces, tokens, or private record details. `requestId` is useful for support and logs. Field-level validation details may be added as a non-sensitive `fields` object after the shared schema is chosen.

## Proposed listing operations

### List active listings

```text
GET /api/listings?sport=<ski|hockey>&category=<value>&condition=<value>&query=<text>&cursor=<opaque>&limit=<bounded>
```

Behavior:

- Anonymous and authenticated callers may read only active/public records.
- Empty or omitted filters mean the default listing order; exact ordering is unresolved.
- Search/filter semantics must match the selected database/search implementation.
- Invalid limits, cursors, sports, categories, or conditions return `validation_error`.

Response: `200` with the page envelope and listing summaries.

### Get one active listing

```text
GET /api/listings/{listingId}
```

Behavior:

- Use stable UUID lookup first; slug/canonical URLs are optional and unresolved.
- A missing, removed, or unauthorized record returns the same `404 not_found` behavior.
- Do not reveal whether a private listing exists.

Response: `200` with listing detail and approved seller/media projections, or `404` with the error envelope.

### Create a listing

```text
POST /api/listings
Idempotency-Key: <opaque key>
```

Body is the shared sport-discriminated create payload. At minimum it includes `sport`, `title`, `description`, `category`, `condition`, `price`, and sport-specific `details`; images, location, tags, negotiation, and shipping fields are conditional.

Behavior:

- Requires an authenticated seller/profile with any approved onboarding requirements.
- Derives `sellerId` from the session; ignores or rejects a client-supplied owner ID.
- Validates the payload with the shared domain schema and server-side constraints.
- Creates `draft` or `pending_review` according to the chosen moderation flow; never creates an active listing directly from an ordinary user client.

Response: `201` with the owner's listing projection, `401 unauthenticated`, `403 forbidden`, or `400 validation_error`.

### Update an owned listing

```text
PATCH /api/listings/{listingId}
Idempotency-Key: <opaque key>
```

Behavior:

- Requires an authenticated session and ownership of an editable state.
- The server controls `sellerId`, status transitions, timestamps, and audit fields.
- An active/sold/reserved listing may not be changed arbitrarily; exact transition rules are unresolved.

Response: `200` with the updated listing or the documented error envelope.

### Operator listing transitions

```text
POST /api/operator/listings/{listingId}/review
POST /api/operator/listings/{listingId}/activate
POST /api/operator/listings/{listingId}/archive
POST /api/operator/listings/{listingId}/remove
```

These operations are illustrative; one state-transition endpoint may be preferable. Each must verify a role claim or server-side operator mapping, validate the allowed transition, record actor/timestamp audit data, and return safe errors. Do not expose these routes to ordinary authenticated users merely because they have a Supabase session.

## Proposed profile/onboarding operations

```text
GET /api/me
PATCH /api/me
POST /api/me/onboarding
```

`GET` requires authentication and returns the minimum approved profile fields. `PATCH` accepts only self-service fields and derives the profile subject from the session. Onboarding requires display name and at least one preferred sport under the current domain contract; optional username, bio, location, avatar, skill level, terms acceptance, and marketing consent require product/privacy review.

Profile names in the existing package support both `displayName`/`name` and `preferredSports`/`favoriteSports` compatibility forms. The wire API should select one canonical spelling and keep compatibility aliases in the validator only while migrations are active.

## Conditional community operations

These operations exist only if community content is approved for the first release and a moderation policy is in place:

```text
GET  /api/community/posts?cursor=<opaque>&sport=<ski|hockey>&type=<value>
POST /api/community/posts
GET  /api/community/posts/{postId}
PATCH /api/community/posts/{postId}
DELETE /api/community/posts/{postId}
POST /api/community/posts/{postId}/comments
POST /api/community/posts/{postId}/reactions
DELETE /api/community/posts/{postId}/reactions/{kind}
POST /api/reports
```

Rules:

- Public reads return only approved/visible content.
- Authors can edit/delete only their own content within the chosen policy window.
- Reactions must be idempotent and database-unique according to the selected one-per-post/kind rule.
- Reports derive `reporterId` from the session, validate target visibility, and do not expose private moderation notes to the reporter.
- Moderator actions require explicit role authorization and audit records.

The current domain package also names `message` as a possible report target, but messaging is deferred; reject that target until messaging exists.

## Deferred transaction operations

The domain contract includes transaction and fulfillment status types, but these are not API commitments for the MVP. Do not implement the following until seller/payment/legal decisions are approved:

```text
POST /api/listings/{listingId}/offers
POST /api/transactions
POST /api/transactions/{transactionId}/pay
POST /api/transactions/{transactionId}/cancel
POST /api/transactions/{transactionId}/fulfill
```

Payment capture, webhooks, refunds, shipping addresses, payout handling, and disputes require a dedicated contract, idempotency rules, provider signature verification, and PII/retention review.

## Status codes and error codes

Minimum mapping:

| HTTP | Code | Meaning |
| --- | --- | --- |
| `400` | `validation_error` | Input, cursor, enum, or state transition is invalid |
| `401` | `unauthenticated` | A valid session is required |
| `403` | `forbidden` | Session is valid but lacks the required role/ownership |
| `404` | `not_found` | Resource is absent or intentionally hidden by visibility policy |
| `409` | `conflict` | Request conflicts with current state or idempotency key |
| `429` | `rate_limited` | Caller exceeded an approved limit; limits are unresolved |
| `500` | `internal_error` | Unexpected server failure; details stay in logs |
| `503` | `dependency_unavailable` | Approved dependency unavailable; use only when distinguishable without leaking data |

The exact error-code registry belongs in the shared domain/contracts package once implementation begins.

## Versioning and compatibility

Start with one versioned logical contract. If URL versioning is used, choose `/api/v1` before external consumers rely on links. Public listing/community URLs should remain stable even when response fields evolve. Add fields compatibly, avoid changing meaning in place, and record breaking changes in an ADR.

## Unresolved contract choices

- Direct Supabase query vs Next.js route handler vs Edge Function for each operation.
- Cursor encoding and default/max page sizes.
- Search/filter vocabulary and sort order.
- Exact listing state transitions, seller projection, and public location precision.
- Whether community content and reports are in the first release, with which moderation states.
- Canonical profile field names and auth provider/deep-link behavior.
- Operator role representation and audit-log persistence.
- Rate limits, abuse controls, public caching headers, and PII retention.
- Whether saves/collections, canonical catalog items, or seller offers are added later.

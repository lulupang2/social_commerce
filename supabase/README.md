# Supabase schema

This directory contains the MVP PostgreSQL schema for Socialapp:

- `migrations/0001_init.sql` creates tables, enums, indexes, timestamp/status
  triggers, ownership checks, and row-level security (RLS).
- `seed.sql` inserts the initial sports catalog. It intentionally does not
  create profiles or user content because those rows must be tied to real
  Supabase Auth users.

## Assumptions

1. The migration runs in a Supabase project where `auth.users` and
   `auth.uid()` already exist. A profile is created automatically by the
   `socialapp_on_auth_user_created` trigger. If a deployment provisions profiles itself,
   it can remove that trigger while retaining the `profiles` table.
2. UUIDs are generated with PostgreSQL's `pgcrypto` extension (`gen_random_uuid`).
   The extension is available in Supabase and is the only extension requested by
   this migration.
3. The API authenticates users through Supabase Auth. RLS compares ownership to
   `auth.uid()`. A trusted server/service-role connection can perform imports
   and moderation; it must not expose its key to clients.
4. `profiles.role` is the source of truth for `user`, `moderator`, and `admin`.
   Only an administrator/trusted server should promote a role or set
   `is_banned`; a trigger rejects those changes from normal user sessions.
5. `reports.target_id` is intentionally polymorphic because reports can target
   listings, posts, comments, profiles, messages, or reviews. The API should
   validate that the target exists and matches `target_type` before insertion.

## Visibility and ownership

- `listings.status = 'active'` and `community_posts.status = 'active'` are
  public. Sellers/authors can also read their own non-public rows, and
  moderators/admins can review all rows.
- Profiles are private to their owner and moderation staff by default. A
  public listing/post response should use a deliberately shaped view or
  server-side summary if seller/author information is needed.
- Listing images inherit listing visibility. Favorites and blocks are private
  to the owning user.
- Conversations and messages are visible/writeable only to their buyer or
  seller participants, with moderation read access for reports. A message
  sender can edit/delete their own message; the other participant can only mark
  it read.
- Comments are public only when both the comment is active and its parent post
  is active. Published reviews are public; review participants retain access
  to their own hidden/deleted rows.

## JSON listing details

`listings.details` is a required JSON object so each sport can evolve its own
attributes without a migration for every field. The initial catalog is `ski`
and `hockey`; example values are:

```json
{
  "brand": "CCM",
  "size": "M",
  "notes": "Minor wear on the blade",
  "position": "goalie"
}
```

The database validates that `details` is an object but intentionally does not
enforce a single schema across sports. API validation can use `sports.slug` to
apply sport-specific fields.

## Status transitions

Triggers reject accidental status jumps:

- Listings: `draft -> pending_review|active|archived|removed`,
  `pending_review -> draft|active|archived|removed`,
  `active -> reserved|sold|archived|removed`,
  `reserved -> active|sold|archived|removed`, `sold -> archived`, and
  `archived -> active|removed`.
- Community posts: `draft -> active|deleted`, `active -> hidden|deleted`, and
  `hidden -> active|deleted`.
- Reports: `open -> in_review|resolved|dismissed`, then `in_review ->
  resolved|dismissed`.

Content moderation should use the status fields (soft hide/delete) instead of
hard-deleting rows. Timestamps are UTC `timestamptz`; `updated_at` is refreshed
by triggers on mutable tables.

## Applying locally

With the Supabase CLI configured, run `supabase start` and then `supabase db
reset` to apply the migration and seed. In a hosted project, link the project
and run `supabase db push`. Keep future schema changes in new, ordered migration
files rather than editing `0001_init.sql` after it has been deployed.

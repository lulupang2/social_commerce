-- Socialapp MVP schema
--
-- This migration targets Supabase's PostgreSQL runtime.  The only Supabase
-- specific dependency is the existing auth.users table and auth.uid() helper;
-- all application tables, enums, indexes, triggers, and policies live in
-- public.

begin;

create extension if not exists pgcrypto;

create type public.app_role as enum ('user', 'moderator', 'admin');
create type public.listing_category as enum (
  'equipment',
  'apparel',
  'protective_gear',
  'accessories',
  'parts',
  'other'
);
create type public.listing_condition as enum ('new', 'like_new', 'good', 'fair', 'poor');
create type public.listing_status as enum (
  'draft',
  'pending_review',
  'active',
  'reserved',
  'sold',
  'archived',
  'removed'
);
create type public.post_status as enum ('draft', 'active', 'hidden', 'deleted');
create type public.comment_status as enum ('active', 'hidden', 'deleted');
create type public.conversation_status as enum ('active', 'archived', 'blocked');
create type public.report_status as enum ('open', 'in_review', 'resolved', 'dismissed');
create type public.report_target_type as enum (
  'listing',
  'community_post',
  'comment',
  'profile',
  'message',
  'review'
);
create type public.report_reason as enum (
  'spam',
  'fraud',
  'harassment',
  'prohibited_item',
  'copyright',
  'other'
);
create type public.review_status as enum ('published', 'hidden', 'deleted');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique,
  display_name text,
  bio text,
  avatar_url text,
  role public.app_role not null default 'user',
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_handle_format
    check (handle is null or handle ~ '^[A-Za-z0-9_]{3,32}$'),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) <= 120)
);

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_slug_format check (slug ~ '^[a-z0-9][a-z0-9_-]{1,63}$')
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete restrict,
  category public.listing_category not null default 'equipment',
  title text not null,
  description text,
  price numeric(12, 2) not null,
  currency text not null default 'USD',
  condition public.listing_condition not null default 'good',
  status public.listing_status not null default 'draft',
  -- Shape is intentionally sport-specific.  For example, a hockey listing
  -- may store {"brand":"CCM","size":"M","position":"goalie"}.
  details jsonb not null default '{}'::jsonb,
  location_text text,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_title_length check (char_length(trim(title)) between 1 and 160),
  constraint listings_description_length
    check (description is null or char_length(description) <= 10000),
  constraint listings_price_nonnegative check (price >= 0),
  constraint listings_currency_format
    check (char_length(currency) = 3 and currency ~ '^[A-Z]{3}$'),
  constraint listings_details_object check (jsonb_typeof(details) = 'object'),
  constraint listings_expiry_after_creation
    check (expires_at is null or expires_at > created_at)
);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint listing_images_sort_order_nonnegative check (sort_order >= 0),
  constraint listing_images_path_not_blank check (char_length(trim(storage_path)) > 0),
  unique (listing_id, sort_order)
);

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings (id) on delete set null,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  status public.conversation_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_distinct_participants check (buyer_id <> seller_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_body_not_blank check (char_length(trim(body)) > 0),
  constraint messages_body_length check (char_length(body) <= 10000)
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  sport_id uuid references public.sports (id) on delete set null,
  title text not null,
  body text not null,
  status public.post_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_posts_title_length
    check (char_length(trim(title)) between 1 and 200),
  constraint community_posts_body_not_blank check (char_length(trim(body)) > 0),
  constraint community_posts_body_length check (char_length(body) <= 50000)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_comment_id uuid references public.comments (id) on delete cascade,
  body text not null,
  status public.comment_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_body_not_blank check (char_length(trim(body)) > 0),
  constraint comments_body_length check (char_length(body) <= 10000),
  constraint comments_not_own_parent check (parent_comment_id is null or parent_comment_id <> id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target_type not null,
  target_id uuid not null,
  reason public.report_reason not null,
  details text,
  status public.report_status not null default 'open',
  assigned_to uuid references public.profiles (id) on delete set null,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_details_length check (details is null or char_length(details) <= 10000),
  constraint reports_resolution_length
    check (resolution is null or char_length(resolution) <= 10000)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_distinct_users check (blocker_id <> blocked_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  reviewee_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  rating smallint not null,
  body text,
  status public.review_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_distinct_users check (reviewer_id <> reviewee_id),
  constraint reviews_rating_range check (rating between 1 and 5),
  constraint reviews_body_length check (body is null or char_length(body) <= 5000)
);

-- Common helper functions ----------------------------------------------------

create or replace function public.is_admin_or_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin'::public.app_role, 'moderator'::public.app_role)
      and not is_banned
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'::public.app_role
      and not is_banned
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Do not copy a provider username into the unique handle column: provider
  -- usernames are not guaranteed to be unique across identity providers.
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', '')
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.enforce_listing_status_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status::text = new.status::text then
    return new;
  end if;

  if (old.status::text = 'draft' and new.status::text in ('pending_review', 'active', 'archived', 'removed'))
     or (old.status::text = 'pending_review' and new.status::text in ('draft', 'active', 'archived', 'removed'))
     or (old.status::text = 'active' and new.status::text in ('reserved', 'sold', 'archived', 'removed'))
     or (old.status::text = 'reserved' and new.status::text in ('active', 'sold', 'archived', 'removed'))
     or (old.status::text = 'sold' and new.status::text = 'archived')
     or (old.status::text = 'archived' and new.status::text in ('active', 'removed')) then
    return new;
  end if;

  raise exception 'listing status transition % -> % is not allowed', old.status, new.status
    using errcode = 'check_violation';
end;
$$;

create or replace function public.enforce_post_status_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status::text = new.status::text then
    return new;
  end if;

  if (old.status::text = 'draft' and new.status::text in ('active', 'deleted'))
     or (old.status::text = 'active' and new.status::text in ('hidden', 'deleted'))
     or (old.status::text = 'hidden' and new.status::text in ('active', 'deleted')) then
    return new;
  end if;

  raise exception 'community post status transition % -> % is not allowed', old.status, new.status
    using errcode = 'check_violation';
end;
$$;

create or replace function public.enforce_report_status_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status::text = new.status::text then
    return new;
  end if;

  if (old.status::text = 'open' and new.status::text in ('in_review', 'resolved', 'dismissed'))
     or (old.status::text = 'in_review' and new.status::text in ('resolved', 'dismissed')) then
    return new;
  end if;

  raise exception 'report status transition % -> % is not allowed', old.status, new.status
    using errcode = 'check_violation';
end;
$$;

create or replace function public.set_report_resolved_at()
returns trigger
language plpgsql
as $$
begin
  if new.status::text in ('resolved', 'dismissed') then
    if tg_op = 'UPDATE' then
      new.resolved_at = coalesce(old.resolved_at, now());
    else
      new.resolved_at = now();
    end if;
  else
    new.resolved_at = null;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  -- A null auth.uid() is the normal trusted-server/service-role path.
  if auth.uid() is not null
     and (new.role is distinct from old.role or new.is_banned is distinct from old.is_banned)
     and not public.is_admin() then
    raise exception 'only an administrator can change profile role or ban state'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace function public.validate_conversation_listing()
returns trigger
language plpgsql
as $$
declare
  listing_seller uuid;
begin
  if new.listing_id is not null then
    select seller_id into listing_seller
    from public.listings
    where id = new.listing_id;

    if listing_seller is null then
      raise exception 'conversation listing does not exist';
    end if;
    if listing_seller <> new.seller_id then
      raise exception 'conversation seller must own the listing';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_conversation_identity_change()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and not public.is_admin()
     and (new.buyer_id is distinct from old.buyer_id
       or new.seller_id is distinct from old.seller_id
       or new.listing_id is distinct from old.listing_id) then
    raise exception 'conversation participants and listing cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_message_identity_change()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and not public.is_admin()
     and (new.conversation_id is distinct from old.conversation_id
       or new.sender_id is distinct from old.sender_id) then
    raise exception 'message sender and conversation cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;

  -- Participants may mark a message read; only the sender may edit or delete it.
  if auth.uid() is not null
     and not public.is_admin()
     and auth.uid() <> old.sender_id
     and (new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at) then
    raise exception 'only the sender can edit or delete a message'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace function public.validate_comment_parent()
returns trigger
language plpgsql
as $$
declare
  parent_post uuid;
begin
  if new.parent_comment_id is not null then
    select post_id into parent_post
    from public.comments
    where id = new.parent_comment_id;

    if parent_post is null or parent_post <> new.post_id then
      raise exception 'comment parent must belong to the same community post';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger sports_set_updated_at
before update on public.sports
for each row execute function public.set_updated_at();

create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

create trigger listings_status_transition
before update of status on public.listings
for each row execute function public.enforce_listing_status_transition();

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create trigger conversations_validate_listing
before insert or update of listing_id, seller_id on public.conversations
for each row execute function public.validate_conversation_listing();

create trigger conversations_protect_identity
before update on public.conversations
for each row execute function public.prevent_conversation_identity_change();

create trigger messages_set_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

create trigger messages_protect_identity
before update on public.messages
for each row execute function public.prevent_message_identity_change();

create trigger community_posts_set_updated_at
before update on public.community_posts
for each row execute function public.set_updated_at();

create trigger community_posts_status_transition
before update of status on public.community_posts
for each row execute function public.enforce_post_status_transition();

create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

create trigger comments_validate_parent
before insert or update of post_id, parent_comment_id on public.comments
for each row execute function public.validate_comment_parent();

create trigger reports_set_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

create trigger reports_status_transition
before update of status on public.reports
for each row execute function public.enforce_report_status_transition();

create trigger reports_set_resolved_at
before insert or update of status on public.reports
for each row execute function public.set_report_resolved_at();

create trigger reviews_set_updated_at
before update on public.reviews
for each row execute function public.set_updated_at();

create trigger profiles_protect_privileges
before update on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();

-- Create a profile automatically after Supabase Auth creates a user.
create trigger socialapp_on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Indexes --------------------------------------------------------------------

create index listings_seller_status_idx on public.listings (seller_id, status, created_at desc);
create index listings_sport_status_created_idx
  on public.listings (sport_id, status, created_at desc);
create index listings_active_created_idx on public.listings (created_at desc) where status = 'active';
create index listing_images_listing_order_idx on public.listing_images (listing_id, sort_order);
create index favorites_listing_idx on public.favorites (listing_id, created_at desc);
create index conversations_buyer_idx on public.conversations (buyer_id, updated_at desc);
create index conversations_seller_idx on public.conversations (seller_id, updated_at desc);
create index conversations_listing_idx on public.conversations (listing_id);
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc);
create index community_posts_author_status_idx
  on public.community_posts (author_id, status, created_at desc);
create index community_posts_sport_status_created_idx
  on public.community_posts (sport_id, status, created_at desc);
create index community_posts_active_created_idx
  on public.community_posts (created_at desc) where status = 'active';
create index comments_post_created_idx on public.comments (post_id, created_at asc);
create index comments_author_idx on public.comments (author_id, created_at desc);
create index reports_status_created_idx on public.reports (status, created_at asc);
create index reports_target_idx on public.reports (target_type, target_id);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);
create index reports_assigned_to_idx on public.reports (assigned_to, status);
create index blocks_blocked_idx on public.blocks (blocked_id);
create index reviews_reviewee_status_idx
  on public.reviews (reviewee_id, status, created_at desc);
create index reviews_listing_idx on public.reviews (listing_id, status);
create unique index conversations_one_per_listing_idx
  on public.conversations (buyer_id, seller_id, listing_id)
  where listing_id is not null;
create unique index conversations_one_without_listing_idx
  on public.conversations (buyer_id, seller_id)
  where listing_id is null;
create unique index reviews_one_per_listing_idx
  on public.reviews (reviewer_id, reviewee_id, listing_id)
  where listing_id is not null;
create unique index reviews_one_without_listing_idx
  on public.reviews (reviewer_id, reviewee_id)
  where listing_id is null;

-- Row-level security ---------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.sports enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.favorites enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.community_posts enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.reviews enable row level security;

-- Profiles are private by default; public listing/post responses can expose a
-- deliberately shaped seller/author summary through an API view or server
-- operation. Role/ban changes are protected by the trigger below.
create policy profiles_owner_read
  on public.profiles for select
  using (id = auth.uid());
create policy profiles_moderator_read
  on public.profiles for select
  using (public.is_admin_or_moderator());
create policy profiles_insert_self
  on public.profiles for insert
  with check (id = auth.uid() and role = 'user' and not is_banned);
create policy profiles_update_self
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
create policy profiles_admin_all
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Sports are reference data.  Active sports are readable publicly; only
-- moderators/admins may change the catalog.
create policy sports_public_read
  on public.sports for select
  using (is_active or public.is_admin_or_moderator());
create policy sports_moderator_insert
  on public.sports for insert
  with check (public.is_admin_or_moderator());
create policy sports_moderator_update
  on public.sports for update
  using (public.is_admin_or_moderator())
  with check (public.is_admin_or_moderator());
create policy sports_moderator_delete
  on public.sports for delete
  using (public.is_admin());

-- Listings: active rows are public, while sellers retain access to their own
-- non-removed drafts/history. Moderators/admins can review and moderate all.
create policy listings_public_read
  on public.listings for select
  using (status = 'active' or seller_id = auth.uid());
create policy listings_moderator_read
  on public.listings for select
  using (public.is_admin_or_moderator());
create policy listings_insert_self
  on public.listings for insert
  with check (seller_id = auth.uid() and status in ('draft', 'active'));
create policy listings_moderator_insert
  on public.listings for insert
  with check (public.is_admin_or_moderator());
create policy listings_update_self
  on public.listings for update
  using (seller_id = auth.uid() and status <> 'removed')
  with check (seller_id = auth.uid() and status <> 'removed');
create policy listings_moderator_update
  on public.listings for update
  using (public.is_admin_or_moderator())
  with check (public.is_admin_or_moderator());
create policy listings_delete_draft
  on public.listings for delete
  using (seller_id = auth.uid() and status = 'draft');
create policy listings_moderator_delete
  on public.listings for delete
  using (public.is_admin());

-- Images follow the visibility/ownership of their listing.
create policy listing_images_public_read
  on public.listing_images for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.status = 'active' or l.seller_id = auth.uid())
    )
  );
create policy listing_images_moderator_read
  on public.listing_images for select
  using (public.is_admin_or_moderator());
create policy listing_images_insert_owner
  on public.listing_images for insert
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.seller_id = auth.uid()
        and l.status <> 'removed'
    )
  );
create policy listing_images_moderator_insert
  on public.listing_images for insert
  with check (public.is_admin_or_moderator());
create policy listing_images_update_owner
  on public.listing_images for update
  using (
    exists (select 1 from public.listings l
      where l.id = listing_id and l.seller_id = auth.uid() and l.status <> 'removed')
  )
  with check (
    exists (select 1 from public.listings l
      where l.id = listing_id and l.seller_id = auth.uid() and l.status <> 'removed')
  );
create policy listing_images_moderator_update
  on public.listing_images for update
  using (public.is_admin_or_moderator())
  with check (public.is_admin_or_moderator());
create policy listing_images_delete_owner
  on public.listing_images for delete
  using (
    exists (select 1 from public.listings l
      where l.id = listing_id and l.seller_id = auth.uid() and l.status <> 'removed')
  );
create policy listing_images_moderator_delete
  on public.listing_images for delete
  using (public.is_admin());

-- Favorites belong to the user; a favorite may only be created for an active
-- listing, but remains visible to its owner if the listing later changes state.
create policy favorites_owner_read
  on public.favorites for select
  using (user_id = auth.uid());
create policy favorites_owner_insert
  on public.favorites for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.listings l where l.id = listing_id and l.status = 'active')
  );
create policy favorites_owner_delete
  on public.favorites for delete
  using (user_id = auth.uid());

-- Conversations and messages are participant-only.  Moderators/admins have
-- read/moderation access so reports can be investigated.
create policy conversations_participant_read
  on public.conversations for select
  using (buyer_id = auth.uid() or seller_id = auth.uid());
create policy conversations_moderator_read
  on public.conversations for select
  using (public.is_admin_or_moderator());
create policy conversations_participant_insert
  on public.conversations for insert
  with check (
    (buyer_id = auth.uid() or seller_id = auth.uid())
    and (listing_id is null or exists (
      select 1 from public.listings l
      where l.id = listing_id and l.status in ('active', 'sold')
    ))
  );
create policy conversations_moderator_insert
  on public.conversations for insert
  with check (public.is_admin_or_moderator());
create policy conversations_participant_update
  on public.conversations for update
  using (buyer_id = auth.uid() or seller_id = auth.uid())
  with check (buyer_id = auth.uid() or seller_id = auth.uid());
create policy conversations_moderator_update
  on public.conversations for update
  using (public.is_admin_or_moderator())
  with check (public.is_admin_or_moderator());

create policy messages_participant_read
  on public.messages for select
  using (
    exists (select 1 from public.conversations c
      where c.id = conversation_id
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid()))
  );
create policy messages_moderator_read
  on public.messages for select
  using (public.is_admin_or_moderator());
create policy messages_participant_insert
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.conversations c
      where c.id = conversation_id
        and c.status <> 'blocked'
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid()))
  );
create policy messages_moderator_insert
  on public.messages for insert
  with check (public.is_admin_or_moderator());
create policy messages_participant_update
  on public.messages for update
  using (
    exists (select 1 from public.conversations c
      where c.id = conversation_id
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid()))
  )
  with check (
    exists (select 1 from public.conversations c
      where c.id = conversation_id
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid()))
  );
create policy messages_moderator_update
  on public.messages for update
  using (public.is_admin_or_moderator())
  with check (public.is_admin_or_moderator());

-- Community: active posts/comments are public; authors may manage their own
-- content, and moderators/admins may hide/delete content.
create policy community_posts_public_read
  on public.community_posts for select
  using (status = 'active' or author_id = auth.uid());
create policy community_posts_moderator_read
  on public.community_posts for select
  using (public.is_admin_or_moderator());
create policy community_posts_insert_self
  on public.community_posts for insert
  with check (author_id = auth.uid() and status in ('draft', 'active'));
create policy community_posts_moderator_insert
  on public.community_posts for insert
  with check (public.is_admin_or_moderator());
create policy community_posts_update_self
  on public.community_posts for update
  using (author_id = auth.uid() and status <> 'deleted')
  with check (author_id = auth.uid());
create policy community_posts_moderator_update
  on public.community_posts for update
  using (public.is_admin_or_moderator())
  with check (public.is_admin_or_moderator());
create policy community_posts_delete_draft
  on public.community_posts for delete
  using (author_id = auth.uid() and status = 'draft');
create policy community_posts_moderator_delete
  on public.community_posts for delete
  using (public.is_admin());

create policy comments_public_read
  on public.comments for select
  using (
    status = 'active'
    and exists (select 1 from public.community_posts p
      where p.id = post_id and p.status = 'active')
  );
create policy comments_author_read
  on public.comments for select
  using (author_id = auth.uid());
create policy comments_moderator_read
  on public.comments for select
  using (public.is_admin_or_moderator());
create policy comments_insert_self
  on public.comments for insert
  with check (
    author_id = auth.uid()
    and status = 'active'
    and exists (select 1 from public.community_posts p
      where p.id = post_id and p.status = 'active')
  );
create policy comments_moderator_insert
  on public.comments for insert
  with check (public.is_admin_or_moderator());
create policy comments_update_self
  on public.comments for update
  using (author_id = auth.uid() and status <> 'deleted')
  with check (author_id = auth.uid());
create policy comments_moderator_update
  on public.comments for update
  using (public.is_admin_or_moderator())
  with check (public.is_admin_or_moderator());

-- Reports are private to the reporter and moderation staff.  target_id is
-- intentionally polymorphic; API validation should ensure it identifies an
-- existing row of target_type before inserting.
create policy reports_reporter_read
  on public.reports for select
  using (reporter_id = auth.uid());
create policy reports_moderator_read
  on public.reports for select
  using (public.is_admin_or_moderator());
create policy reports_insert_self
  on public.reports for insert
  with check (reporter_id = auth.uid() and status = 'open');
create policy reports_moderator_insert
  on public.reports for insert
  with check (public.is_admin_or_moderator());
create policy reports_moderator_update
  on public.reports for update
  using (public.is_admin_or_moderator())
  with check (public.is_admin_or_moderator());

-- Blocks are private user-owned relationships, with moderation read access.
create policy blocks_owner_read
  on public.blocks for select
  using (blocker_id = auth.uid());
create policy blocks_moderator_read
  on public.blocks for select
  using (public.is_admin_or_moderator());
create policy blocks_owner_insert
  on public.blocks for insert
  with check (blocker_id = auth.uid());
create policy blocks_owner_delete
  on public.blocks for delete
  using (blocker_id = auth.uid());

-- Published reviews are public.  Review authors can edit their own review;
-- moderators/admins can hide/delete any review.
create policy reviews_public_read
  on public.reviews for select
  using (status = 'published');
create policy reviews_participant_read
  on public.reviews for select
  using (reviewer_id = auth.uid() or reviewee_id = auth.uid());
create policy reviews_moderator_read
  on public.reviews for select
  using (public.is_admin_or_moderator());
create policy reviews_insert_self
  on public.reviews for insert
  with check (reviewer_id = auth.uid() and status = 'published');
create policy reviews_moderator_insert
  on public.reviews for insert
  with check (public.is_admin_or_moderator());
create policy reviews_update_self
  on public.reviews for update
  using (reviewer_id = auth.uid() and status <> 'deleted')
  with check (reviewer_id = auth.uid());
create policy reviews_moderator_update
  on public.reviews for update
  using (public.is_admin_or_moderator())
  with check (public.is_admin_or_moderator());

-- Supabase normally grants these through its public-schema defaults.  The
-- conditional block keeps the migration safe in Postgres installations that
-- do not create Supabase's API roles, while making the intended API privileges
-- explicit when those roles exist.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant usage on schema public to anon';
    execute 'grant select on all tables in schema public to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant usage on schema public to authenticated';
    execute 'grant select, insert, update, delete on all tables in schema public to authenticated';
  end if;
end;
$$;

commit;

-- Canonical profile preferences, one-like community reactions, and publication boundaries.
-- This migration intentionally tightens the deployed 0001 policies instead of editing them.

begin;

alter table public.profiles
  add column onboarding_completed_at timestamptz;

-- JSON checks mirror the shared domain contract. Unknown keys and authority-like
-- fields are rejected at the database boundary as well as by application validation.
create or replace function public.is_valid_profile_size_preferences(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if value is null then
    return true;
  end if;

  if jsonb_typeof(value) <> 'object'
     or value - array[
       'footLengthMm',
       'bootMondopointMm',
       'skiLengthCm',
       'skateSize',
       'skateWidth',
       'apparelSize',
       'protectiveGearSize'
     ] <> '{}'::jsonb then
    return false;
  end if;

  if value ? 'footLengthMm'
     and (
       jsonb_typeof(value -> 'footLengthMm') <> 'number'
       or (value ->> 'footLengthMm')::numeric <> trunc((value ->> 'footLengthMm')::numeric)
       or (value ->> 'footLengthMm')::numeric not between 100 and 400
     ) then
    return false;
  end if;

  if value ? 'bootMondopointMm'
     and (
       jsonb_typeof(value -> 'bootMondopointMm') <> 'number'
       or (value ->> 'bootMondopointMm')::numeric
         <> trunc((value ->> 'bootMondopointMm')::numeric)
       or (value ->> 'bootMondopointMm')::numeric not between 100 and 400
     ) then
    return false;
  end if;

  if value ? 'skiLengthCm'
     and (
       jsonb_typeof(value -> 'skiLengthCm') <> 'number'
       or (value ->> 'skiLengthCm')::numeric <> trunc((value ->> 'skiLengthCm')::numeric)
       or (value ->> 'skiLengthCm')::numeric not between 60 and 230
     ) then
    return false;
  end if;

  if value ? 'skateSize'
     and (
       jsonb_typeof(value -> 'skateSize') <> 'number'
       or (value ->> 'skateSize')::numeric <= 0
       or (value ->> 'skateSize')::numeric > 20
     ) then
    return false;
  end if;

  if value ? 'skateWidth'
     and (
       jsonb_typeof(value -> 'skateWidth') <> 'string'
       or char_length(trim(value ->> 'skateWidth')) not between 1 and 20
     ) then
    return false;
  end if;

  if value ? 'apparelSize'
     and (
       jsonb_typeof(value -> 'apparelSize') <> 'string'
       or (value ->> 'apparelSize') not in ('XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL')
     ) then
    return false;
  end if;

  if value ? 'protectiveGearSize'
     and (
       jsonb_typeof(value -> 'protectiveGearSize') <> 'string'
       or (value ->> 'protectiveGearSize')
         not in ('youth', 'junior', 'senior_s', 'senior_m', 'senior_l')
     ) then
    return false;
  end if;

  return true;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$$;

create or replace function public.is_valid_profile_equipment_preferences(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if value is null then
    return true;
  end if;

  if jsonb_typeof(value) <> 'object'
     or value - array['discipline', 'format', 'position', 'handedness'] <> '{}'::jsonb then
    return false;
  end if;

  if value ? 'discipline'
     and (
       jsonb_typeof(value -> 'discipline') <> 'string'
       or (value ->> 'discipline') not in (
         'all_mountain',
         'alpine',
         'cross_country',
         'freeride',
         'freestyle',
         'touring',
         'telemark',
         'other'
       )
     ) then
    return false;
  end if;

  if value ? 'format'
     and (
       jsonb_typeof(value -> 'format') <> 'string'
       or (value ->> 'format') not in ('ice', 'street', 'roller', 'other')
     ) then
    return false;
  end if;

  if value ? 'position'
     and (
       jsonb_typeof(value -> 'position') <> 'string'
       or (value ->> 'position') not in ('forward', 'defense', 'goalie', 'any')
     ) then
    return false;
  end if;

  if value ? 'handedness'
     and (
       jsonb_typeof(value -> 'handedness') <> 'string'
       or (value ->> 'handedness') not in ('left', 'right')
     ) then
    return false;
  end if;

  return true;
end;
$$;

create table public.profile_sports (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete restrict,
  skill_level text,
  size_preferences jsonb,
  preferences jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, sport_id),
  constraint profile_sports_skill_level_allowed
    check (skill_level is null or skill_level in ('beginner', 'intermediate', 'advanced', 'expert')),
  constraint profile_sports_size_preferences_valid
    check (public.is_valid_profile_size_preferences(size_preferences)),
  constraint profile_sports_preferences_valid
    check (public.is_valid_profile_equipment_preferences(preferences))
);

create or replace function public.prepare_owned_record_insert()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.created_at = now();
    new.updated_at = new.created_at;
  end if;
  return new;
end;
$$;

create or replace function public.protect_profile_sport_identity()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and (
       new.profile_id is distinct from old.profile_id
       or new.sport_id is distinct from old.sport_id
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'profile sport identity and creation time cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger profile_sports_prepare_insert
before insert on public.profile_sports
for each row execute function public.prepare_owned_record_insert();

create trigger profile_sports_protect_identity
before update on public.profile_sports
for each row execute function public.protect_profile_sport_identity();

create trigger profile_sports_set_updated_at
before update on public.profile_sports
for each row execute function public.set_updated_at();

alter table public.profile_sports enable row level security;

create policy profile_sports_owner_read
  on public.profile_sports for select
  to authenticated
  using (profile_id = auth.uid());

create policy profile_sports_owner_insert
  on public.profile_sports for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid() and not me.is_banned
    )
    and exists (
      select 1
      from public.sports sport
      where sport.id = sport_id and sport.is_active
    )
  );

create policy profile_sports_owner_update
  on public.profile_sports for update
  to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid() and not me.is_banned
    )
    and exists (
      select 1
      from public.sports sport
      where sport.id = sport_id and sport.is_active
    )
  );

create policy profile_sports_owner_delete
  on public.profile_sports for delete
  to authenticated
  using (profile_id = auth.uid());

-- Completion is a one-way server timestamp. A user may request completion only
-- after a display name and at least one canonical profile_sports row exist.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  -- A null auth.uid() is the trusted migration/service-role path.
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'profile identity and creation time cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;

  if (new.role is distinct from old.role or new.is_banned is distinct from old.is_banned)
     and not public.is_admin() then
    raise exception 'only an administrator can change profile role or ban state'
      using errcode = 'insufficient_privilege';
  end if;

  if new.onboarding_completed_at is distinct from old.onboarding_completed_at
     and not public.is_admin() then
    if new.id <> auth.uid()
       or old.onboarding_completed_at is not null
       or new.onboarding_completed_at is null
       or nullif(trim(new.display_name), '') is null
       or not exists (
         select 1
         from public.profile_sports preference
         where preference.profile_id = new.id
       ) then
      raise exception 'onboarding requires a display name and at least one sport preference'
        using errcode = 'check_violation';
    end if;

    new.onboarding_completed_at = now();
  end if;

  return new;
end;
$$;

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles for insert
  to authenticated
  with check (
    id = auth.uid()
    and role = 'user'
    and not is_banned
    and onboarding_completed_at is null
  );

-- Deliberately shaped public projection: only sellers with an active listing
-- appear, and role, ban state, bio, and other private profile fields are absent.
create view public.public_seller_profiles
with (security_barrier = true)
as
select
  profile.id,
  profile.handle,
  profile.display_name,
  profile.avatar_url
from public.profiles profile
where not profile.is_banned
  and exists (
    select 1
    from public.listings listing
    where listing.seller_id = profile.id
      and listing.status = 'active'
  );

revoke all on public.public_seller_profiles from public;

-- One row is one like. There is intentionally no reaction-kind column.
create table public.community_reactions (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create or replace function public.prepare_reaction_insert()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.created_at = now();
  end if;
  return new;
end;
$$;

create trigger community_reactions_prepare_insert
before insert on public.community_reactions
for each row execute function public.prepare_reaction_insert();

create index community_reactions_user_created_idx
  on public.community_reactions (user_id, created_at desc);

alter table public.community_reactions enable row level security;

create policy community_reactions_owner_read
  on public.community_reactions for select
  to authenticated
  using (user_id = auth.uid());

create policy community_reactions_owner_insert
  on public.community_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid() and not me.is_banned
    )
    and exists (
      select 1
      from public.community_posts post
      where post.id = post_id and post.status = 'active'
    )
  );

create policy community_reactions_owner_delete
  on public.community_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- The aggregate view exposes only active post IDs and counts, never reactor IDs.
create view public.community_post_reaction_counts
with (security_barrier = true)
as
select
  post.id as post_id,
  count(reaction.user_id)::bigint as like_count
from public.community_posts post
left join public.community_reactions reaction on reaction.post_id = post.id
where post.status = 'active'
group by post.id;

revoke all on public.community_post_reaction_counts from public;

-- Immutable audit rows are written by triggers only for operator publication
-- and moderation actions. Polymorphic targets intentionally have no FK.
create table public.publication_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_role public.app_role not null,
  target_type text not null,
  target_id uuid not null,
  action text not null,
  from_status text not null,
  to_status text not null,
  occurred_at timestamptz not null default now(),
  constraint publication_audit_operator_role
    check (actor_role in ('moderator', 'admin')),
  constraint publication_audit_target_type
    check (target_type in ('listing', 'community_post')),
  constraint publication_audit_action
    check (action in ('publish', 'archive', 'hide', 'remove', 'restore'))
);

create index publication_audit_target_idx
  on public.publication_audit_events (target_type, target_id, occurred_at desc);
create index publication_audit_actor_idx
  on public.publication_audit_events (actor_id, occurred_at desc);

alter table public.publication_audit_events enable row level security;

create policy publication_audit_operator_read
  on public.publication_audit_events for select
  to authenticated
  using (public.is_admin_or_moderator());

-- Replace the permissive state trigger logic. Ordinary sellers can only submit
-- a draft for review; only operators can cross into or out of public states.
create or replace function public.enforce_listing_status_transition()
returns trigger
language plpgsql
as $$
declare
  operator_allowed boolean;
begin
  if old.status = new.status then
    return new;
  end if;

  operator_allowed :=
    (old.status = 'draft' and new.status in ('pending_review', 'archived', 'removed'))
    or (old.status = 'pending_review' and new.status in ('draft', 'active', 'archived', 'removed'))
    or (old.status = 'active' and new.status in ('reserved', 'sold', 'archived', 'removed'))
    or (old.status = 'reserved' and new.status in ('active', 'sold', 'archived', 'removed'))
    or (old.status = 'sold' and new.status = 'archived')
    or (old.status = 'archived' and new.status in ('active', 'removed'));

  if auth.uid() is null or public.is_admin_or_moderator() then
    if not operator_allowed then
      raise exception 'listing status transition % -> % is not allowed', old.status, new.status
        using errcode = 'check_violation';
    end if;
  elsif old.seller_id = auth.uid()
        and old.status = 'draft'
        and new.status = 'pending_review' then
    null;
  else
    raise exception 'only an operator may publish or moderate a listing'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status = 'active' and old.status <> 'active' then
    new.published_at = coalesce(old.published_at, now());
  elsif new.status in ('draft', 'pending_review') then
    new.published_at = null;
  end if;

  return new;
end;
$$;

create or replace function public.protect_listing_identity()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and (
       new.id is distinct from old.id
       or new.seller_id is distinct from old.seller_id
       or new.created_at is distinct from old.created_at
       or (
         new.status is not distinct from old.status
         and new.published_at is distinct from old.published_at
       )
     ) then
    raise exception 'listing identity and publication timestamps are server managed'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_post_status_transition()
returns trigger
language plpgsql
as $$
declare
  operator_allowed boolean;
begin
  if old.status = new.status then
    return new;
  end if;

  operator_allowed :=
    (old.status = 'draft' and new.status in ('active', 'deleted'))
    or (old.status = 'active' and new.status in ('hidden', 'deleted'))
    or (old.status = 'hidden' and new.status in ('active', 'deleted'));

  if auth.uid() is null or public.is_admin_or_moderator() then
    if not operator_allowed then
      raise exception 'community post status transition % -> % is not allowed', old.status, new.status
        using errcode = 'check_violation';
    end if;
  else
    raise exception 'only an operator may publish or moderate a community post'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status = 'active' and old.status <> 'active' then
    new.published_at = coalesce(old.published_at, now());
  elsif new.status = 'draft' then
    new.published_at = null;
  end if;

  return new;
end;
$$;

create or replace function public.protect_community_post_identity()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and (
       new.id is distinct from old.id
       or new.author_id is distinct from old.author_id
       or new.created_at is distinct from old.created_at
       or (
         new.status is not distinct from old.status
         and new.published_at is distinct from old.published_at
       )
     ) then
    raise exception 'post identity and publication timestamps are server managed'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create or replace function public.record_publication_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_actor uuid := auth.uid();
  current_role public.app_role;
  event_action text;
  event_target_type text;
begin
  if old.status::text = new.status::text or current_actor is null then
    return new;
  end if;

  select profile.role
  into current_role
  from public.profiles profile
  where profile.id = current_actor
    and profile.role in ('moderator', 'admin')
    and not profile.is_banned;

  if current_role is null then
    return new;
  end if;

  event_target_type := case tg_table_name
    when 'listings' then 'listing'
    when 'community_posts' then 'community_post'
  end;

  event_action := case
    when new.status::text = 'active' and old.status::text in ('archived', 'hidden') then 'restore'
    when new.status::text = 'active' then 'publish'
    when new.status::text = 'archived' then 'archive'
    when new.status::text = 'hidden' then 'hide'
    when new.status::text in ('removed', 'deleted') then 'remove'
  end;

  if event_target_type is not null and event_action is not null then
    insert into public.publication_audit_events (
      actor_id,
      actor_role,
      target_type,
      target_id,
      action,
      from_status,
      to_status
    )
    values (
      current_actor,
      current_role,
      event_target_type,
      new.id,
      event_action,
      old.status::text,
      new.status::text
    );
  end if;

  return new;
end;
$$;

create trigger listings_record_publication
after update of status on public.listings
for each row execute function public.record_publication_audit_event();

create trigger listings_prepare_insert
before insert on public.listings
for each row execute function public.prepare_owned_record_insert();

create trigger listings_protect_identity
before update on public.listings
for each row execute function public.protect_listing_identity();

create trigger community_posts_record_publication
after update of status on public.community_posts
for each row execute function public.record_publication_audit_event();

create trigger community_posts_prepare_insert
before insert on public.community_posts
for each row execute function public.prepare_owned_record_insert();

create trigger community_posts_protect_identity
before update on public.community_posts
for each row execute function public.protect_community_post_identity();

-- Replace permissive 0001 policies. Multiple policies are ORed by PostgreSQL,
-- so every broad predecessor must be removed before the narrow policy is added.
drop policy if exists listings_insert_self on public.listings;
drop policy if exists listings_moderator_insert on public.listings;
drop policy if exists listings_update_self on public.listings;

create policy listings_insert_self
  on public.listings for insert
  to authenticated
  with check (
    seller_id = auth.uid()
    and status = 'draft'
    and published_at is null
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid() and not me.is_banned
    )
  );

create policy listings_update_self
  on public.listings for update
  to authenticated
  using (seller_id = auth.uid() and status = 'draft')
  with check (
    seller_id = auth.uid()
    and status in ('draft', 'pending_review')
    and published_at is null
  );

drop policy if exists community_posts_insert_self on public.community_posts;
drop policy if exists community_posts_moderator_insert on public.community_posts;
drop policy if exists community_posts_update_self on public.community_posts;

create policy community_posts_insert_self
  on public.community_posts for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and status = 'draft'
    and published_at is null
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid() and not me.is_banned
    )
  );

create policy community_posts_update_self
  on public.community_posts for update
  to authenticated
  using (author_id = auth.uid() and status = 'draft')
  with check (
    author_id = auth.uid()
    and status = 'draft'
    and published_at is null
  );

-- Explicit privileges for objects created after 0001's blanket grant block.
revoke all on public.profile_sports from public;
revoke all on public.community_reactions from public;
revoke all on public.publication_audit_events from public;
revoke execute on function public.prepare_owned_record_insert() from public;
revoke execute on function public.protect_profile_sport_identity() from public;
revoke execute on function public.prepare_reaction_insert() from public;
revoke execute on function public.record_publication_audit_event() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant select on public.public_seller_profiles to anon;
    grant select on public.community_post_reaction_counts to anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.profile_sports to authenticated;
    grant select, insert, delete on public.community_reactions to authenticated;
    grant select on public.publication_audit_events to authenticated;
    grant select on public.public_seller_profiles to authenticated;
    grant select on public.community_post_reaction_counts to authenticated;
  end if;
end;
$$;

commit;

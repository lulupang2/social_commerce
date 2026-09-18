-- Complete the SummerGear cutover for canonical sports, profile preferences,
-- and native push-token registration without rewriting deployed migrations.

begin;

-- The original reference IDs are stable across clients and demo fixtures. Existing
-- IceGear rows at those IDs are migrated in place so every foreign key remains valid.
insert into public.sports (id, slug, name, description, is_active)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'summergear_surf_pending',
    '서핑 전환 중',
    'SummerGear canonical surf reference row',
    false
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'summergear_tennis_pending',
    '테니스 전환 중',
    'SummerGear canonical tennis reference row',
    false
  )
on conflict (id) do nothing;

alter table public.profile_sports
  drop constraint profile_sports_size_preferences_valid,
  drop constraint profile_sports_preferences_valid;

do $$
declare
  duplicate_id uuid;
begin
  select id
  into duplicate_id
  from public.sports
  where slug = 'surf'
    and id <> '11111111-1111-4111-8111-111111111111'
  limit 1;

  if duplicate_id is not null then
    update public.listings
    set sport_id = '11111111-1111-4111-8111-111111111111'
    where sport_id = duplicate_id;

    update public.community_posts
    set sport_id = '11111111-1111-4111-8111-111111111111'
    where sport_id = duplicate_id;

    insert into public.profile_sports (
      profile_id,
      sport_id,
      skill_level,
      size_preferences,
      preferences,
      created_at,
      updated_at
    )
    select
      profile_id,
      '11111111-1111-4111-8111-111111111111',
      skill_level,
      size_preferences,
      preferences,
      created_at,
      updated_at
    from public.profile_sports
    where sport_id = duplicate_id
    on conflict (profile_id, sport_id) do nothing;

    delete from public.profile_sports where sport_id = duplicate_id;
    delete from public.sports where id = duplicate_id;
  end if;

  duplicate_id := null;

  select id
  into duplicate_id
  from public.sports
  where slug = 'tennis'
    and id <> '22222222-2222-4222-8222-222222222222'
  limit 1;

  if duplicate_id is not null then
    update public.listings
    set sport_id = '22222222-2222-4222-8222-222222222222'
    where sport_id = duplicate_id;

    update public.community_posts
    set sport_id = '22222222-2222-4222-8222-222222222222'
    where sport_id = duplicate_id;

    insert into public.profile_sports (
      profile_id,
      sport_id,
      skill_level,
      size_preferences,
      preferences,
      created_at,
      updated_at
    )
    select
      profile_id,
      '22222222-2222-4222-8222-222222222222',
      skill_level,
      size_preferences,
      preferences,
      created_at,
      updated_at
    from public.profile_sports
    where sport_id = duplicate_id
    on conflict (profile_id, sport_id) do nothing;

    delete from public.profile_sports where sport_id = duplicate_id;
    delete from public.sports where id = duplicate_id;
  end if;
end;
$$;

update public.sports
set slug = 'surf',
    name = '서핑',
    description = '숏보드·롱보드·펀보드·웻슈트·핀·리시 및 워터스포츠 용품',
    is_active = true,
    updated_at = now()
where id = '11111111-1111-4111-8111-111111111111';

update public.sports
set slug = 'tennis',
    name = '테니스',
    description = '테니스 라켓·가방·올코트화·스트링·그립 및 라켓스포츠 용품',
    is_active = true,
    updated_at = now()
where id = '22222222-2222-4222-8222-222222222222';

insert into public.sports (id, slug, name, description, is_active)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'surf',
    '서핑',
    '숏보드·롱보드·펀보드·웻슈트·핀·리시 및 워터스포츠 용품',
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'tennis',
    '테니스',
    '테니스 라켓·가방·올코트화·스트링·그립 및 라켓스포츠 용품',
    true
  )
on conflict (id) do update
set slug = excluded.slug,
    name = excluded.name,
    description = excluded.description,
    is_active = true,
    updated_at = now();

update public.sports
set is_active = false,
    updated_at = now()
where slug in ('ski', 'hockey');

-- These checks mirror packages/domain/src/profiles.ts. Unknown keys, authority
-- fields, non-finite values encoded outside PostgreSQL numeric, and bad ranges fail.
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
       'shoeSizeMm',
       'apparelSize',
       'boardLengthFeet',
       'volumeLiters',
       'wetsuitThickness',
       'headSizeSqIn',
       'weightGrams',
       'gripSize'
     ] <> '{}'::jsonb then
    return false;
  end if;

  if value ? 'shoeSizeMm'
     and (
       jsonb_typeof(value -> 'shoeSizeMm') <> 'number'
       or (value ->> 'shoeSizeMm')::numeric <> trunc((value ->> 'shoeSizeMm')::numeric)
       or (value ->> 'shoeSizeMm')::numeric not between 100 and 400
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

  if value ? 'boardLengthFeet'
     and (
       jsonb_typeof(value -> 'boardLengthFeet') <> 'number'
       or (value ->> 'boardLengthFeet')::numeric <= 0
       or (value ->> 'boardLengthFeet')::numeric > 20
     ) then
    return false;
  end if;

  if value ? 'volumeLiters'
     and (
       jsonb_typeof(value -> 'volumeLiters') <> 'number'
       or (value ->> 'volumeLiters')::numeric <= 0
       or (value ->> 'volumeLiters')::numeric > 300
     ) then
    return false;
  end if;

  if value ? 'wetsuitThickness'
     and (
       jsonb_typeof(value -> 'wetsuitThickness') <> 'string'
       or (value ->> 'wetsuitThickness') not in ('2mm', '3_2mm', '4_3mm', '5_4mm', 'other')
     ) then
    return false;
  end if;

  if value ? 'headSizeSqIn'
     and (
       jsonb_typeof(value -> 'headSizeSqIn') <> 'number'
       or (value ->> 'headSizeSqIn')::numeric <= 0
       or (value ->> 'headSizeSqIn')::numeric > 150
     ) then
    return false;
  end if;

  if value ? 'weightGrams'
     and (
       jsonb_typeof(value -> 'weightGrams') <> 'number'
       or (value ->> 'weightGrams')::numeric <= 0
       or (value ->> 'weightGrams')::numeric > 600
     ) then
    return false;
  end if;

  if value ? 'gripSize'
     and (
       jsonb_typeof(value -> 'gripSize') <> 'string'
       or char_length(btrim(value ->> 'gripSize')) not between 1 and 20
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
     or value - array['surfDiscipline', 'tennisPlayStyle', 'handedness'] <> '{}'::jsonb then
    return false;
  end if;

  if value ? 'surfDiscipline'
     and (
       jsonb_typeof(value -> 'surfDiscipline') <> 'string'
       or (value ->> 'surfDiscipline') not in (
         'shortboard',
         'longboard',
         'funboard',
         'fish',
         'sup',
         'bodyboard',
         'foil',
         'other'
       )
     ) then
    return false;
  end if;

  if value ? 'tennisPlayStyle'
     and (
       jsonb_typeof(value -> 'tennisPlayStyle') <> 'string'
       or (value ->> 'tennisPlayStyle') not in (
         'baseline_aggressive',
         'all_court',
         'serve_volley',
         'recreational',
         'other'
       )
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

update public.profile_sports
set size_preferences = case
      when public.is_valid_profile_size_preferences(size_preferences) then size_preferences
      else null
    end,
    preferences = case
      when public.is_valid_profile_equipment_preferences(preferences) then preferences
      else null
    end;

alter table public.profile_sports
  add constraint profile_sports_size_preferences_valid
    check (public.is_valid_profile_size_preferences(size_preferences)),
  add constraint profile_sports_preferences_valid
    check (public.is_valid_profile_equipment_preferences(preferences));

create or replace function public.is_valid_profile_location(value jsonb)
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
       'city',
       'region',
       'country',
       'postalCode',
       'latitude',
       'longitude',
       'raw'
     ] <> '{}'::jsonb then
    return false;
  end if;

  if value ? 'city'
     and (
       jsonb_typeof(value -> 'city') <> 'string'
       or char_length(btrim(value ->> 'city')) not between 1 and 80
     ) then
    return false;
  end if;

  if value ? 'region'
     and (
       jsonb_typeof(value -> 'region') <> 'string'
       or char_length(btrim(value ->> 'region')) not between 1 and 80
     ) then
    return false;
  end if;

  if value ? 'country'
     and (
       jsonb_typeof(value -> 'country') <> 'string'
       or char_length(btrim(value ->> 'country')) not between 1 and 80
     ) then
    return false;
  end if;

  if value ? 'postalCode'
     and (
       jsonb_typeof(value -> 'postalCode') <> 'string'
       or char_length(btrim(value ->> 'postalCode')) not between 1 and 20
     ) then
    return false;
  end if;

  if value ? 'raw'
     and (
       jsonb_typeof(value -> 'raw') <> 'string'
       or char_length(btrim(value ->> 'raw')) not between 1 and 160
     ) then
    return false;
  end if;

  if value ? 'latitude'
     and (
       jsonb_typeof(value -> 'latitude') <> 'number'
       or (value ->> 'latitude')::numeric not between -90 and 90
     ) then
    return false;
  end if;

  if value ? 'longitude'
     and (
       jsonb_typeof(value -> 'longitude') <> 'number'
       or (value ->> 'longitude')::numeric not between -180 and 180
     ) then
    return false;
  end if;

  return true;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$$;

alter table public.profiles
  add column location jsonb;

alter table public.profiles
  drop constraint profiles_handle_format,
  drop constraint profiles_display_name_length;

alter table public.profiles
  add constraint profiles_handle_format
    check (handle is null or handle ~ '^[a-z0-9_][a-z0-9_-]{1,29}$') not valid,
  add constraint profiles_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 1 and 80) not valid,
  add constraint profiles_bio_length
    check (bio is null or char_length(btrim(bio)) <= 500) not valid,
  add constraint profiles_avatar_https
    check (avatar_url is null or avatar_url ~ '^https://') not valid,
  add constraint profiles_location_valid
    check (public.is_valid_profile_location(location));

-- Native clients register Expo push tokens through the authenticated public client.
-- A token belongs to exactly one account and can be rotated by the owning account.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null,
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_token_length
    check (char_length(btrim(expo_push_token)) between 10 and 512),
  constraint push_tokens_platform_allowed
    check (platform in ('ios', 'android')),
  constraint push_tokens_device_id_length
    check (device_id is null or char_length(btrim(device_id)) between 1 and 200)
);

create index if not exists push_tokens_user_updated_idx
  on public.push_tokens (user_id, updated_at desc);

alter table public.push_tokens enable row level security;

create policy push_tokens_owner_read
  on public.push_tokens for select
  to authenticated
  using (user_id = auth.uid());

create policy push_tokens_owner_insert
  on public.push_tokens for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid() and not profile.is_banned
    )
  );

create policy push_tokens_owner_update
  on public.push_tokens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_tokens_owner_delete
  on public.push_tokens for delete
  to authenticated
  using (user_id = auth.uid());

create trigger push_tokens_set_updated_at
before update on public.push_tokens
for each row execute function public.set_updated_at();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.push_tokens to authenticated;
  end if;
end;
$$;

commit;

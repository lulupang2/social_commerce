begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select no_plan();

select is(
  (
    select array_agg(slug order by slug)::text
    from public.sports
    where id in (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
      and is_active
  ),
  '{surf,tennis}'::text,
  'canonical reference IDs resolve to active SummerGear sports'
);

select ok(
  public.is_valid_profile_size_preferences(
    '{
      "shoeSizeMm":270,
      "apparelSize":"M",
      "boardLengthFeet":5.11,
      "volumeLiters":32.6,
      "wetsuitThickness":"3_2mm",
      "headSizeSqIn":100,
      "weightGrams":300,
      "gripSize":"2"
    }'::jsonb
  ),
  'all canonical SummerGear size preferences pass the database boundary'
);

select ok(
  not public.is_valid_profile_size_preferences(
    '{"bootMondopointMm":265,"skiLengthCm":168}'::jsonb
  ),
  'retired winter-sport size keys fail closed'
);

select ok(
  public.is_valid_profile_equipment_preferences(
    '{
      "surfDiscipline":"shortboard",
      "tennisPlayStyle":"all_court",
      "handedness":"right"
    }'::jsonb
  ),
  'canonical SummerGear equipment preferences pass the database boundary'
);

select ok(
  not public.is_valid_profile_equipment_preferences(
    '{"discipline":"all_mountain"}'::jsonb
  ),
  'retired winter-sport preference keys fail closed'
);

select ok(
  public.is_valid_profile_location(
    '{"city":"양양군","region":"강원도","latitude":38.075,"longitude":128.619}'::jsonb
  ),
  'canonical profile location passes the database boundary'
);

select ok(
  not public.is_valid_profile_location('{"city":"양양군","role":"admin"}'::jsonb),
  'unknown profile location keys fail closed'
);

select ok(
  exists (
    select 1
    from pg_enum value
    join pg_type type on type.oid = value.enumtypid
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public'
      and type.typname = 'listing_status'
      and value.enumlabel = 'rejected'
  ),
  'listing status supports an auditable rejected state'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.listings'::regclass
      and conname = 'listings_category_summer_allowed'
  ),
  'listings reject retired category values at the table boundary'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.push_tokens'::regclass
  ),
  'push token storage has row level security enabled'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'push_tokens'
  ),
  4,
  'push tokens expose exactly the owner CRUD policies'
);

select * from finish();
rollback;

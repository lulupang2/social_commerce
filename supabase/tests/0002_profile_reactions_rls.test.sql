begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select no_plan();

create function pg_temp.sqlstate_of(command text)
returns text
language plpgsql
as $$
begin
  execute command;
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

insert into public.sports (id, slug, name, description)
values
  ('11111111-1111-4111-8111-111111111111', 'ski', 'Ski', 'Test reference sport'),
  ('22222222-2222-4222-8222-222222222222', 'hockey', 'Hockey', 'Test reference sport')
on conflict (slug) do update
set is_active = true;

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  is_anonymous,
  created_at,
  updated_at
)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'profile-owner@example.test',
    '{"provider":"email"}',
    '{"display_name":"Profile Owner"}',
    false,
    now(),
    now()
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'profile-other@example.test',
    '{"provider":"email"}',
    '{"display_name":"Other User"}',
    false,
    now(),
    now()
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'profile-moderator@example.test',
    '{"provider":"email"}',
    '{"display_name":"Moderator"}',
    false,
    now(),
    now()
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'profile-admin@example.test',
    '{"provider":"email"}',
    '{"display_name":"Administrator"}',
    false,
    now(),
    now()
  );

update public.profiles
set role = case id
  when 'a1000000-0000-4000-8000-000000000003'::uuid then 'moderator'::public.app_role
  when 'a1000000-0000-4000-8000-000000000004'::uuid then 'admin'::public.app_role
  else role
end,
handle = case id
  when 'a1000000-0000-4000-8000-000000000001'::uuid then 'profile_owner'
  else handle
end,
bio = case id
  when 'a1000000-0000-4000-8000-000000000001'::uuid then 'private profile biography'
  else bio
end;

insert into public.community_posts (
  id,
  author_id,
  sport_id,
  title,
  body,
  status,
  published_at
)
values
  (
    'b1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    (select id from public.sports where slug = 'ski'),
    'Active post',
    'An approved post used by the reaction contract test.',
    'active',
    now()
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    (select id from public.sports where slug = 'ski'),
    'Draft post',
    'A private draft must not accept reactions.',
    'draft',
    null
  );

insert into public.community_posts (
  id,
  author_id,
  sport_id,
  post_type,
  title,
  body,
  status,
  published_at
)
values (
  'b1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000002',
  (select id from public.sports where slug = 'hockey'),
  'question',
  'Other author draft',
  'This draft must not expose its author.',
  'draft',
  null
);

insert into public.listings (
  id,
  seller_id,
  sport_id,
  title,
  price,
  status,
  published_at
)
values (
  'c1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  (select id from public.sports where slug = 'ski'),
  'Approved seller listing',
  100,
  'active',
  now()
);

select results_eq(
  $sql$
    select enumlabel::text
    from pg_enum
    where enumtypid = 'public.community_post_type'::regtype
    order by enumsortorder
  $sql$,
  $values$
    values
      ('discussion'::text),
      ('question'::text),
      ('guide'::text),
      ('meetup'::text),
      ('review'::text)
  $values$,
  'community post types match the shared domain contract'
);

select is(
  (
    select post_type::text
    from public.community_posts
    where id = 'b1000000-0000-4000-8000-000000000001'
  ),
  'discussion'::text,
  'community posts default to the discussion type'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.community_posts (author_id, post_type, title, body)
    values (
      'a1000000-0000-4000-8000-000000000001',
      'announcement',
      'Invalid type',
      'Unsupported community post types must fail.'
    )
  $sql$),
  '22P02',
  'unsupported community post types are rejected'
);

select is(
  to_regclass('public.community_posts_active_type_created_idx')::text,
  'community_posts_active_type_created_idx'::text,
  'active community posts have a type filter index'
);

-- Owner: canonical preferences, strict validation, and onboarding completion.
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $sql$
    insert into public.profile_sports (
      profile_id,
      sport_id,
      skill_level,
      size_preferences,
      preferences
    )
    values (
      'a1000000-0000-4000-8000-000000000001',
      (select id from public.sports where slug = 'ski'),
      'intermediate',
      '{"bootMondopointMm":255,"skiLengthCm":168}',
      '{"discipline":"all_mountain"}'
    )
  $sql$,
  'an owner can store canonical sport preferences'
);

select is(
  (select count(*)::bigint from public.profile_sports),
  1::bigint,
  'an owner reads only their own profile_sports rows'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.profile_sports (profile_id, sport_id)
    values (
      'a1000000-0000-4000-8000-000000000001',
      (select id from public.sports where slug = 'ski')
    )
  $sql$),
  '23505',
  'the profile/sport primary key rejects duplicates'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.profile_sports (profile_id, sport_id, skill_level)
    values (
      'a1000000-0000-4000-8000-000000000001',
      (select id from public.sports where slug = 'hockey'),
      'professional'
    )
  $sql$),
  '23514',
  'unknown skill levels fail at the database boundary'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.profile_sports (profile_id, sport_id, size_preferences)
    values (
      'a1000000-0000-4000-8000-000000000001',
      (select id from public.sports where slug = 'hockey'),
      '{"role":"admin"}'
    )
  $sql$),
  '23514',
  'unknown authority-like size keys are rejected'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.profile_sports (profile_id, sport_id, preferences)
    values (
      'a1000000-0000-4000-8000-000000000001',
      (select id from public.sports where slug = 'hockey'),
      '{"handedness":"ambidextrous"}'
    )
  $sql$),
  '23514',
  'unsafe preference enum values are rejected'
);

select ok(
  not public.is_valid_profile_size_preferences('[]'::jsonb),
  'non-object size input is invalid'
);

select lives_ok(
  $sql$
    update public.profiles
    set onboarding_completed_at = '2000-01-01T00:00:00Z'
    where id = 'a1000000-0000-4000-8000-000000000001'
  $sql$,
  'an owner can complete onboarding after adding a sport'
);

select ok(
  (
    select onboarding_completed_at > now() - interval '1 minute'
    from public.profiles
    where id = 'a1000000-0000-4000-8000-000000000001'
  ),
  'the database replaces a client onboarding time with server time'
);

select lives_ok(
  $sql$
    insert into public.community_reactions (post_id, user_id)
    values (
      'b1000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001'
    )
  $sql$,
  'an authenticated owner can like an active post'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.community_reactions (post_id, user_id)
    values (
      'b1000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001'
    )
  $sql$),
  '23505',
  'a second like by the same user is rejected'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.community_reactions (post_id, user_id)
    values (
      'b1000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000001'
    )
  $sql$),
  '42501',
  'draft posts cannot receive likes'
);

-- Other user: owner preferences are invisible and onboarding is incomplete.
reset role;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::bigint from public.profile_sports),
  0::bigint,
  'another user cannot read owner preference rows'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.profile_sports (profile_id, sport_id)
    values (
      'a1000000-0000-4000-8000-000000000001',
      (select id from public.sports where slug = 'hockey')
    )
  $sql$),
  '42501',
  'another user cannot write owner preference rows'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.profiles
    set onboarding_completed_at = now()
    where id = 'a1000000-0000-4000-8000-000000000002'
  $sql$),
  '23514',
  'onboarding cannot complete without at least one sport preference'
);

select lives_ok(
  $sql$
    insert into public.community_reactions (post_id, user_id)
    values (
      'b1000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002'
    )
  $sql$,
  'a second user may independently like the same active post'
);

select is(
  (select count(*)::bigint from public.community_reactions),
  1::bigint,
  'a user sees only their own likedByMe relationship'
);

select is(
  (
    select count(*)::bigint
    from public.profiles
    where id = 'a1000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'another user cannot probe the private owner profile'
);

-- Operators do not receive unaudited support access to private preferences.
reset role;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::bigint from public.profile_sports),
  0::bigint,
  'a moderator has no blanket profile preference access'
);

reset role;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::bigint from public.profile_sports),
  0::bigint,
  'an administrator also needs an explicit audited support path'
);

-- Anonymous access is limited to shaped aggregate/public seller projections.
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select is(
  pg_temp.sqlstate_of('select * from public.profile_sports'),
  '42501',
  'anonymous callers have no profile_sports table privilege'
);

select is(
  pg_temp.sqlstate_of('select * from public.community_reactions'),
  '42501',
  'anonymous callers cannot enumerate reactors'
);

select is(
  (
    select like_count
    from public.community_post_reaction_counts
    where post_id = 'b1000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'anonymous callers see only the aggregate active-post like count'
);

select is(
  (
    select count(*)::bigint
    from public.community_post_reaction_counts
    where post_id = 'b1000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'draft post aggregate rows are not exposed'
);

select is(
  (
    select count(*)::bigint
    from public.public_seller_profiles
    where id = 'a1000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'an active listing exposes the shaped public seller projection'
);

select is(
  (
    select display_name
    from public.public_community_authors
    where id = 'a1000000-0000-4000-8000-000000000001'
  ),
  'Profile Owner'::text,
  'anonymous callers can resolve an active post author'
);

select is(
  (
    select count(*)::bigint
    from public.public_community_authors
    where id = 'a1000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'a draft-only author is absent from the public projection'
);

reset role;

select results_eq(
  $sql$
    select column_name::text
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_seller_profiles'
    order by ordinal_position
  $sql$,
  $values$
    values ('id'::text), ('handle'::text), ('display_name'::text), ('avatar_url'::text)
  $values$,
  'the public seller projection contains only its four approved fields'
);

select results_eq(
  $sql$
    select column_name::text
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_community_authors'
    order by ordinal_position
  $sql$,
  $values$
    values ('id'::text), ('display_name'::text), ('avatar_url'::text)
  $values$,
  'the public author projection excludes bio, role, and ban state'
);

select ok(
  has_table_privilege('anon', 'public.public_community_authors', 'select'),
  'anonymous callers have explicit access to the public author projection'
);

select ok(
  has_table_privilege('authenticated', 'public.public_community_authors', 'select'),
  'authenticated callers have explicit access to the public author projection'
);

select is(
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'community_reactions'
      and column_name in ('kind', 'reaction_type')
  ),
  0::bigint,
  'the one-like table has no obsolete reaction-kind column'
);

select * from finish();
rollback;

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

create function pg_temp.affected_rows(command text)
returns bigint
language plpgsql
as $$
declare
  affected bigint;
begin
  execute command;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

insert into public.sports (id, slug, name, description)
values
  ('11111111-1111-4111-8111-111111111111', 'surf', '서핑', 'Test reference sport'),
  ('22222222-2222-4222-8222-222222222222', 'tennis', '테니스', 'Test reference sport')
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
    'a2000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'publication-owner@example.test',
    '{"provider":"email"}',
    '{"display_name":"Publication Owner"}',
    false,
    now(),
    now()
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'publication-other@example.test',
    '{"provider":"email"}',
    '{"display_name":"Other Author"}',
    false,
    now(),
    now()
  ),
  (
    'a2000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'publication-moderator@example.test',
    '{"provider":"email"}',
    '{"display_name":"Moderator"}',
    false,
    now(),
    now()
  ),
  (
    'a2000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'publication-admin@example.test',
    '{"provider":"email"}',
    '{"display_name":"Administrator"}',
    false,
    now(),
    now()
  );

update public.profiles
set role = case id
  when 'a2000000-0000-4000-8000-000000000003'::uuid then 'moderator'::public.app_role
  when 'a2000000-0000-4000-8000-000000000004'::uuid then 'admin'::public.app_role
  else role
end;

-- Ordinary seller/author: draft-only creation and seller submission.
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.listings (
      id, seller_id, sport_id, title, price, status, published_at
    )
    values (
      'c2000000-0000-4000-8000-000000000099',
      'a2000000-0000-4000-8000-000000000001',
      (select id from public.sports where slug = 'surf'),
      'Forbidden active insert',
      10,
      'active',
      now()
    )
  $sql$),
  '42501',
  'an ordinary seller cannot insert an active listing'
);

select lives_ok(
  $sql$
    insert into public.listings (
      id, seller_id, sport_id, title, price, status
    )
    values (
      'c2000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001',
      (select id from public.sports where slug = 'surf'),
      'Seller draft',
      10,
      'draft'
    )
  $sql$,
  'an ordinary seller can create their own draft'
);

select lives_ok(
  $sql$
    insert into public.listings (
      id, seller_id, sport_id, title, price, status
    )
    values (
      'c2000000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000001',
      (select id from public.sports where slug = 'tennis'),
      'Second seller draft',
      20,
      'draft'
    )
  $sql$,
  'the seller can keep another draft for transition tests'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.listings
    set created_at = '2000-01-01T00:00:00Z'
    where id = 'c2000000-0000-4000-8000-000000000001'
  $sql$),
  '42501',
  'a seller cannot forge listing identity timestamps'
);

select lives_ok(
  $sql$
    update public.listings
    set status = 'pending_review'
    where id = 'c2000000-0000-4000-8000-000000000001'
  $sql$,
  'a seller can submit a draft for review'
);

select is(
  pg_temp.affected_rows($sql$
    update public.listings
    set status = 'active'
    where id = 'c2000000-0000-4000-8000-000000000001'
  $sql$),
  0::bigint,
  'a seller cannot publish a pending listing'
);

select is(
  pg_temp.affected_rows($sql$
    update public.listings
    set title = 'Changed after submission'
    where id = 'c2000000-0000-4000-8000-000000000001'
  $sql$),
  0::bigint,
  'a seller cannot edit content after submission'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.community_posts (
      id, author_id, title, body, status, published_at
    )
    values (
      'b2000000-0000-4000-8000-000000000099',
      'a2000000-0000-4000-8000-000000000001',
      'Forbidden active post',
      'Ordinary authors cannot publish.',
      'active',
      now()
    )
  $sql$),
  '42501',
  'an ordinary author cannot insert an active community post'
);

select lives_ok(
  $sql$
    insert into public.community_posts (
      id, author_id, title, body, status
    )
    values (
      'b2000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001',
      'Author draft',
      'This post needs moderation before publication.',
      'draft'
    )
  $sql$,
  'an ordinary author can create a draft community post'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.community_posts
    set status = 'active'
    where id = 'b2000000-0000-4000-8000-000000000001'
  $sql$),
  '42501',
  'an ordinary author cannot publish their draft post'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.profiles
    set role = 'admin'
    where id = 'a2000000-0000-4000-8000-000000000001'
  $sql$),
  '42501',
  'an ordinary user cannot promote their own role'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.profiles
    set is_banned = true
    where id = 'a2000000-0000-4000-8000-000000000001'
  $sql$),
  '42501',
  'an ordinary user cannot change their own ban state'
);

select is(
  (select count(*)::bigint from public.publication_audit_events),
  0::bigint,
  'an ordinary user cannot read publication audit rows'
);

reset role;
select is(
  (select count(*)::bigint from public.publication_audit_events),
  0::bigint,
  'seller submission does not masquerade as an operator publication event'
);

-- Another user: private drafts are not distinguishable from missing IDs.
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::bigint
    from public.listings
    where id = 'c2000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'another user cannot see a seller draft'
);

select is(
  (
    select count(*)::bigint
    from public.community_posts
    where id = 'b2000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'another user cannot see an author draft'
);

select is(
  pg_temp.affected_rows($sql$
    update public.listings
    set title = 'Probe'
    where id = 'c2000000-0000-4000-8000-000000000002'
  $sql$),
  0::bigint,
  'updating an inaccessible draft has the same zero-row result as not found'
);

-- Moderator: only the approved publication transitions succeed and are audited.
reset role;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $sql$
    update public.listings
    set status = 'active'
    where id = 'c2000000-0000-4000-8000-000000000001'
  $sql$,
  'a moderator can publish a pending listing'
);

select ok(
  (
    select published_at is not null
    from public.listings
    where id = 'c2000000-0000-4000-8000-000000000001'
  ),
  'listing publication receives a server timestamp'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.listings
    set status = 'active'
    where id = 'c2000000-0000-4000-8000-000000000002'
  $sql$),
  '23514',
  'an operator cannot skip listing pending review'
);

select lives_ok(
  $sql$
    update public.listings
    set status = 'pending_review'
    where id = 'c2000000-0000-4000-8000-000000000002'
  $sql$,
  'an operator can move a draft into review'
);

select lives_ok(
  $sql$
    update public.listings
    set status = 'rejected'
    where id = 'c2000000-0000-4000-8000-000000000002'
  $sql$,
  'a moderator can reject a pending listing'
);

select is(
  (
    select count(*)::bigint
    from public.publication_audit_events
    where actor_id = 'a2000000-0000-4000-8000-000000000003'
      and target_id = 'c2000000-0000-4000-8000-000000000002'
      and action = 'reject'
  ),
  1::bigint,
  'listing rejection is audited'
);

select lives_ok(
  $sql$
    update public.community_posts
    set status = 'active'
    where id = 'b2000000-0000-4000-8000-000000000001'
  $sql$,
  'a moderator can publish a draft community post'
);

select is(
  (
    select count(*)::bigint
    from public.publication_audit_events
    where actor_id = 'a2000000-0000-4000-8000-000000000003'
      and action = 'publish'
  ),
  2::bigint,
  'moderator listing and post publications are both audited'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.listings
    set published_at = '2000-01-01T00:00:00Z'
    where id = 'c2000000-0000-4000-8000-000000000001'
  $sql$),
  '42501',
  'an operator cannot rewrite publication time without a transition'
);

select is(
  pg_temp.affected_rows($sql$
    update public.profiles
    set role = 'moderator'
    where id = 'a2000000-0000-4000-8000-000000000002'
  $sql$),
  0::bigint,
  'a moderator cannot change application roles'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.publication_audit_events
    set action = 'remove'
    where target_id = 'c2000000-0000-4000-8000-000000000001'
  $sql$),
  '42501',
  'publication audit events cannot be mutated through operator privileges'
);

-- Admin: moderation transitions and role/ban administration are explicit.
reset role;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000004', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $sql$
    update public.community_posts
    set status = 'hidden'
    where id = 'b2000000-0000-4000-8000-000000000001'
  $sql$,
  'an admin can hide active community content'
);

select lives_ok(
  $sql$
    update public.community_posts
    set status = 'active'
    where id = 'b2000000-0000-4000-8000-000000000001'
  $sql$,
  'an admin can restore hidden community content'
);

select is(
  (
    select count(*)::bigint
    from public.publication_audit_events
    where actor_id = 'a2000000-0000-4000-8000-000000000004'
      and action in ('hide', 'restore')
  ),
  2::bigint,
  'admin hide and restore actions are audited'
);

select lives_ok(
  $sql$
    update public.profiles
    set role = 'moderator', is_banned = true
    where id = 'a2000000-0000-4000-8000-000000000002'
  $sql$,
  'an admin can manage role and ban state'
);

select ok(
  (
    select role = 'moderator' and is_banned
    from public.profiles
    where id = 'a2000000-0000-4000-8000-000000000002'
  ),
  'the admin role/ban mutation is persisted'
);

-- Published rows are public; drafts remain indistinguishable from missing.
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select is(
  (
    select count(*)::bigint
    from public.listings
    where id = 'c2000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'anonymous callers can read an active listing'
);

select is(
  (
    select count(*)::bigint
    from public.listings
    where id = 'c2000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'anonymous callers cannot read a rejected listing'
);

select is(
  (
    select count(*)::bigint
    from public.community_posts
    where id = 'b2000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'anonymous callers can read a restored active post'
);

select * from finish();
rollback;

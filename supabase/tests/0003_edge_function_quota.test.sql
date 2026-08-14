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
    'a4000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'quota-owner@example.test',
    '{"provider":"email"}',
    '{"display_name":"Quota Owner"}',
    false,
    now(),
    now()
  ),
  (
    'a4000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'quota-other@example.test',
    '{"provider":"email"}',
    '{"display_name":"Quota Other"}',
    false,
    now(),
    now()
  ),
  (
    'a4000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'quota-moderator@example.test',
    '{"provider":"email"}',
    '{"display_name":"Quota Moderator"}',
    false,
    now(),
    now()
  ),
  (
    'a4000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'quota-admin@example.test',
    '{"provider":"email"}',
    '{"display_name":"Quota Administrator"}',
    false,
    now(),
    now()
  );

update public.profiles
set role = case id
  when 'a4000000-0000-4000-8000-000000000003'::uuid then 'moderator'::public.app_role
  when 'a4000000-0000-4000-8000-000000000004'::uuid then 'admin'::public.app_role
  else role
end;

-- Owner consumption is persisted, bounded, and strict about operation names.
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a4000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select ok(
  (
    select allowed
      and remaining = 9
      and limit_value = 10
      and window_seconds = 60
      and reset_at > now()
      and reset_at <= now() + interval '61 seconds'
    from public.consume_edge_function_quota('recommend-listings')
  ),
  'recommendation quota returns a bounded persistent window'
);

select is(
  pg_temp.sqlstate_of('select * from public.edge_function_rate_limits'),
  '42501',
  'clients cannot read the backing quota table directly'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.edge_function_rate_limits
    set request_count = 1, window_started_at = now()
  $sql$),
  '42501',
  'clients cannot reset quota state directly'
);

select is(
  pg_temp.sqlstate_of($sql$
    select * from public.consume_edge_function_quota('unknown-operation')
  $sql$),
  '22023',
  'unknown quota operations fail closed'
);

select ok(
  (
    select allowed and remaining = 2 and limit_value = 3 and window_seconds = 300
    from public.consume_edge_function_quota('analyze-listing')
  ),
  'the first analysis request consumes one of three five-minute slots'
);

select ok(
  (
    select allowed and remaining = 1
    from public.consume_edge_function_quota('analyze-listing')
  ),
  'the second analysis request remains allowed'
);

select ok(
  (
    select allowed and remaining = 0
    from public.consume_edge_function_quota('analyze-listing')
  ),
  'the final analysis slot is allowed with zero remaining'
);

select ok(
  (
    select not allowed and remaining = 0
    from public.consume_edge_function_quota('analyze-listing')
  ),
  'the next analysis request is denied persistently'
);

-- Another subject receives an independent row and cannot target the owner.
reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a4000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select ok(
  (
    select allowed and remaining = 9
    from public.consume_edge_function_quota('recommend-listings')
  ),
  'another user receives an independent recommendation window'
);

select is(
  pg_temp.sqlstate_of($sql$
    select *
    from public.consume_edge_function_quota(
      'recommend-listings',
      'a4000000-0000-4000-8000-000000000001'::uuid
    )
  $sql$),
  '42883',
  'the RPC has no overload that accepts another subject ID'
);

-- Moderator/admin roles consume their own quota; the role is not a bypass.
reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000003', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a4000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select ok(
  (
    select allowed and remaining = 2
    from public.consume_edge_function_quota('analyze-listing')
  ),
  'a moderator consumes the same per-subject analysis quota'
);

reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a4000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

select ok(
  (
    select allowed and remaining = 2
    from public.consume_edge_function_quota('analyze-listing')
  ),
  'an admin also consumes a per-subject analysis quota'
);

select lives_ok(
  $sql$
    update public.profiles
    set is_banned = true
    where id = 'a4000000-0000-4000-8000-000000000002'
  $sql$,
  'an admin can ban the second quota subject'
);

reset role;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a4000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  pg_temp.sqlstate_of($sql$
    select * from public.consume_edge_function_quota('recommend-listings')
  $sql$),
  '42501',
  'a banned subject cannot consume Edge Function quota'
);

-- Anonymous callers have neither a subject nor RPC execution privilege.
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select is(
  pg_temp.sqlstate_of($sql$
    select * from public.consume_edge_function_quota('recommend-listings')
  $sql$),
  '42501',
  'anonymous callers cannot consume authenticated Edge Function quota'
);

reset role;

select ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.edge_function_rate_limits'::regclass
  ),
  'row-level security is enabled on persistent quota state'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'consume_edge_function_quota'
      and procedure.pronargs = 1
  ),
  1::bigint,
  'the only quota RPC signature accepts operation, never subject or limits'
);

select is(
  (
    select count(*)::bigint
    from public.edge_function_rate_limits
    where subject_id = 'a4000000-0000-4000-8000-000000000001'
      and operation in ('recommend-listings', 'analyze-listing')
  ),
  2::bigint,
  'the owner quota survives as one persistent row per approved operation'
);

select is(
  (
    select request_count
    from public.edge_function_rate_limits
    where subject_id = 'a4000000-0000-4000-8000-000000000001'
      and operation = 'analyze-listing'
  ),
  4,
  'denied requests are capped at limit plus one without resetting the window'
);

select * from finish();
rollback;

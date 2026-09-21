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
  ('11111111-1111-4111-8111-111111111111', 'surf', '서핑', 'Test reference sport')
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
    'a3000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'media-seller@example.test',
    '{"provider":"email"}',
    '{"display_name":"Media Seller"}',
    false,
    now(),
    now()
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'chat-buyer@example.test',
    '{"provider":"email"}',
    '{"display_name":"Chat Buyer"}',
    false,
    now(),
    now()
  ),
  (
    'a3000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'chat-outsider@example.test',
    '{"provider":"email"}',
    '{"display_name":"Outsider"}',
    false,
    now(),
    now()
  ),
  (
    'a3000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'chat-moderator@example.test',
    '{"provider":"email"}',
    '{"display_name":"Moderator"}',
    false,
    now(),
    now()
  ),
  (
    'a3000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'chat-admin@example.test',
    '{"provider":"email"}',
    '{"display_name":"Administrator"}',
    false,
    now(),
    now()
  );

update public.profiles
set role = case id
  when 'a3000000-0000-4000-8000-000000000004'::uuid then 'moderator'::public.app_role
  when 'a3000000-0000-4000-8000-000000000005'::uuid then 'admin'::public.app_role
  else role
end;

insert into public.listings (
  id,
  seller_id,
  sport_id,
  title,
  price,
  status,
  published_at
)
values
  (
    'c3000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    (select id from public.sports where slug = 'surf'),
    'Draft media listing',
    10,
    'draft',
    null
  ),
  (
    'c3000000-0000-4000-8000-000000000002',
    'a3000000-0000-4000-8000-000000000001',
    (select id from public.sports where slug = 'surf'),
    'Active media listing',
    20,
    'active',
    now()
  ),
  (
    'c3000000-0000-4000-8000-000000000003',
    'a3000000-0000-4000-8000-000000000001',
    (select id from public.sports where slug = 'surf'),
    'Pending media listing',
    30,
    'pending_review',
    null
  );

insert into public.listing_images (
  id,
  listing_id,
  storage_path,
  alt_text,
  sort_order
)
values
  (
    'd3000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000002',
    'a3000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000002/active.jpg',
    'Approved active listing image',
    0
  ),
  (
    'd3000000-0000-4000-8000-000000000003',
    'c3000000-0000-4000-8000-000000000003',
    'a3000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000003/pending.jpg',
    'Pending review listing image',
    0
  );

insert into public.conversations (
  id,
  buyer_id,
  seller_id,
  status,
  created_at,
  updated_at
)
values (
  'e3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000001',
  'active',
  '2000-01-01T00:00:00Z',
  '2000-01-01T00:00:00Z'
);

select ok(
  not (select public from storage.buckets where id = 'listing-images'),
  'the listing-images bucket is private'
);

select ok(
  public.is_valid_listing_image_object_name(
    'a3000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001/photo.jpg'
  ),
  'the canonical owner/listing/object namespace is valid'
);

select ok(
  not public.is_valid_listing_image_object_name(
    'a3000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001/../secret.jpg'
  ),
  'path traversal input is rejected before Storage access'
);

select ok(
  not public.is_valid_listing_image_object_name('https://example.test/public.jpg'),
  'a public URL is never accepted as an object key'
);

-- Draft owner: object metadata and uploads stay inside the owned namespace.
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $sql$
    insert into public.listing_images (
      id, listing_id, storage_path, alt_text, sort_order
    )
    values (
      'd3000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001/draft.jpg',
      'Seller draft listing image',
      0
    )
  $sql$,
  'a seller can add metadata in their draft namespace'
);

select is(
  (select count(*)::bigint from public.listing_images),
  1::bigint,
  'the seller sees raw metadata only for their draft'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.listing_images (
      id, listing_id, storage_path, alt_text, sort_order
    )
    values (
      'd3000000-0000-4000-8000-000000000099',
      'c3000000-0000-4000-8000-000000000001',
      'https://example.test/public.jpg',
      'Forbidden public URL',
      1
    )
  $sql$),
  '23514',
  'listing image metadata rejects a public URL path'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.listing_images
    set storage_path = 'a3000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001/renamed.jpg'
    where id = 'd3000000-0000-4000-8000-000000000001'
  $sql$),
  '42501',
  'a client cannot rewrite an image object identity'
);

select lives_ok(
  $sql$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'listing-images',
      'a3000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001/draft.jpg',
      'a3000000-0000-4000-8000-000000000001'
    )
  $sql$,
  'a seller can create an object only in an owned draft namespace'
);

select is(
  (select count(*)::bigint from storage.objects where bucket_id = 'listing-images'),
  0::bigint,
  'direct object select is denied outside a narrow Storage mutation operation'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'listing-images',
      'a3000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000002/active.jpg',
      'a3000000-0000-4000-8000-000000000001'
    )
  $sql$),
  '42501',
  'direct object upload is closed after a listing leaves draft'
);

select ok(
  public.can_sign_listing_image('d3000000-0000-4000-8000-000000000001'),
  'a seller may request a signed projection for their draft image'
);

select ok(
  public.can_sign_listing_image('d3000000-0000-4000-8000-000000000002'),
  'an active image is signable for the seller as public content'
);

select ok(
  not public.can_sign_listing_image('d3000000-0000-4000-8000-000000000003'),
  'a seller cannot sign a pending-review image through the draft exception'
);

-- Chat sender: inserts are canonicalized and authority fields are protected.
select lives_ok(
  $sql$
    insert into public.messages (
      id, conversation_id, sender_id, body, created_at, updated_at
    )
    values (
      'f3000000-0000-4000-8000-000000000001',
      'e3000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      'Is this item still available?',
      '2000-01-01T00:00:00Z',
      '2000-01-01T00:00:00Z'
    )
  $sql$,
  'a participant can send a message'
);

select ok(
  (
    select created_at > now() - interval '1 minute'
    from public.messages
    where id = 'f3000000-0000-4000-8000-000000000001'
  ),
  'message creation time is canonicalized by the database'
);

select ok(
  (
    select updated_at > '2000-01-01T00:00:00Z'
    from public.conversations
    where id = 'e3000000-0000-4000-8000-000000000001'
  ),
  'a new message touches conversation ordering state'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.messages (
      id, conversation_id, sender_id, body, read_at
    )
    values (
      'f3000000-0000-4000-8000-000000000099',
      'e3000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      'Forged read state',
      now()
    )
  $sql$),
  '42501',
  'a sender cannot pre-mark a new message read'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.messages
    set read_at = now()
    where id = 'f3000000-0000-4000-8000-000000000001'
  $sql$),
  '42501',
  'a sender cannot mark their own message read'
);

select lives_ok(
  $sql$
    update public.messages
    set body = 'Is the item still available?'
    where id = 'f3000000-0000-4000-8000-000000000001'
  $sql$,
  'a sender may edit their undeleted message body'
);

select is(
  (
    select unread_count
    from public.get_my_conversation_unread_counts()
    where conversation_id = 'e3000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'sent messages do not count as unread for the sender'
);

-- Other authenticated user: private metadata/chat are consistently absent.
reset role;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a3000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::bigint from public.listing_images),
  0::bigint,
  'another user cannot read draft or active raw image metadata'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'listing-images',
      'a3000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001/outsider.jpg',
      'a3000000-0000-4000-8000-000000000003'
    )
  $sql$),
  '42501',
  'another user cannot upload into the seller namespace'
);

select ok(
  not public.can_sign_listing_image('d3000000-0000-4000-8000-000000000001'),
  'another user receives false for an inaccessible draft image'
);

select ok(
  public.can_sign_listing_image('d3000000-0000-4000-8000-000000000002'),
  'another user may request the active image projection'
);

select ok(
  not public.can_sign_listing_image('d3000000-0000-4000-8000-000000000099'),
  'an unknown image has the same false result as an inaccessible image'
);

select is(
  (select count(*)::bigint from public.messages),
  0::bigint,
  'a nonparticipant cannot read conversation messages'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.messages (conversation_id, sender_id, body)
    values (
      'e3000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000003',
      'Outsider probe'
    )
  $sql$),
  '42501',
  'a nonparticipant cannot insert into a conversation'
);

select is(
  public.mark_conversation_read('e3000000-0000-4000-8000-000000000001'),
  0,
  'a nonparticipant read mutation returns the same zero result as not found'
);

select is(
  (select count(*)::bigint from public.get_my_conversation_unread_counts()),
  0::bigint,
  'a nonparticipant receives no unread-count rows'
);

-- Recipient: only the read state of incoming messages may change.
reset role;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a3000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select unread_count
    from public.get_my_conversation_unread_counts()
    where conversation_id = 'e3000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the recipient sees one incoming unread message'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.messages
    set body = 'Recipient rewrite'
    where id = 'f3000000-0000-4000-8000-000000000001'
  $sql$),
  '42501',
  'a recipient cannot edit another sender body'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.messages
    set created_at = '2000-01-01T00:00:00Z'
    where id = 'f3000000-0000-4000-8000-000000000001'
  $sql$),
  '42501',
  'a participant cannot forge message timestamps'
);

select is(
  public.mark_conversation_read('e3000000-0000-4000-8000-000000000001'),
  1,
  'the recipient can atomically mark incoming unread messages read'
);

select is(
  public.mark_conversation_read('e3000000-0000-4000-8000-000000000001'),
  0,
  'marking an already-read conversation is idempotent'
);

select lives_ok(
  $sql$
    insert into public.messages (id, conversation_id, sender_id, body)
    values (
      'f3000000-0000-4000-8000-000000000002',
      'e3000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000002',
      'Yes, it is available.'
    )
  $sql$,
  'the other participant can reply'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.messages
    set deleted_at = now()
    where id = 'f3000000-0000-4000-8000-000000000001'
  $sql$),
  '42501',
  'a recipient cannot delete another sender message'
);

-- Original sender receives the reply and owns one-way deletion of their row.
reset role;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select unread_count
    from public.get_my_conversation_unread_counts()
    where conversation_id = 'e3000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the original sender sees the participant reply as unread'
);

select is(
  public.mark_conversation_read('e3000000-0000-4000-8000-000000000001'),
  1,
  'the original sender can mark the reply read as its recipient'
);

select lives_ok(
  $sql$
    update public.messages
    set deleted_at = now()
    where id = 'f3000000-0000-4000-8000-000000000001'
  $sql$,
  'a sender may soft-delete their own message'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.messages
    set deleted_at = null
    where id = 'f3000000-0000-4000-8000-000000000001'
  $sql$),
  '42501',
  'message deletion is one-way for client actors'
);

-- Moderation roles may investigate but cannot inject or rewrite chat rows.
reset role;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000004', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a3000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::bigint from public.messages),
  2::bigint,
  'a moderator retains read-only report investigation access'
);

select is(
  (select count(*)::bigint from public.listing_images),
  0::bigint,
  'a moderator cannot read raw image object keys'
);

select ok(
  public.can_sign_listing_image('d3000000-0000-4000-8000-000000000003'),
  'a moderator can authorize a signed pending-review projection'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.messages (conversation_id, sender_id, body)
    values (
      'e3000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000004',
      'Moderator injection'
    )
  $sql$),
  '42501',
  'a moderator cannot inject a private message'
);

select is(
  pg_temp.affected_rows($sql$
    update public.messages
    set body = 'Moderator rewrite'
    where id = 'f3000000-0000-4000-8000-000000000002'
  $sql$),
  0::bigint,
  'a moderator cannot mutate arbitrary message fields'
);

reset role;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000005', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a3000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::bigint from public.messages),
  2::bigint,
  'an admin also retains read-only investigation access'
);

select is(
  pg_temp.affected_rows($sql$
    update public.messages
    set body = 'Admin rewrite'
    where id = 'f3000000-0000-4000-8000-000000000002'
  $sql$),
  0::bigint,
  'an admin client role cannot rewrite message content'
);

select ok(
  public.can_sign_listing_image('d3000000-0000-4000-8000-000000000003'),
  'an admin can authorize a signed pending-review projection'
);

-- Anonymous actors get boolean signer authorization only for active media.
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select is(
  (select count(*)::bigint from public.listing_images),
  0::bigint,
  'anonymous callers cannot read raw listing image metadata'
);

select ok(
  public.can_sign_listing_image('d3000000-0000-4000-8000-000000000002'),
  'anonymous callers can authorize an active image projection'
);

select ok(
  not public.can_sign_listing_image('d3000000-0000-4000-8000-000000000001'),
  'anonymous callers cannot authorize a draft image projection'
);

select ok(
  not public.can_sign_listing_image('d3000000-0000-4000-8000-000000000003'),
  'anonymous callers cannot authorize a pending image projection'
);

-- Structural checks cover the Realtime and operation-aware Storage boundary.
reset role;

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('messages', 'conversations')
  ),
  2::bigint,
  'messages and conversations are both in the Realtime publication'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_class
    where oid in ('public.messages'::regclass, 'public.conversations'::regclass)
      and relreplident = 'f'
  ),
  2::bigint,
  'chat tables use full replica identity for participant updates'
);

select ok(
  (
    select qual not like '%storage.object.sign%'
       and qual not like '%storage.object.get_authenticated%'
       and qual not like '%storage.object.list%'
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'listing_images_owner_mutation_select'
  ),
  'the client Storage SELECT policy excludes sign, download, and list operations'
);

select * from finish();
rollback;

-- Private listing media and participant-scoped Realtime chat support.
-- Read signing is intentionally kept behind a trusted service boundary so
-- clients cannot choose an expiry longer than the approved ten-minute limit.

begin;

insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

create or replace function public.is_valid_listing_image_object_name(object_name text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select object_name is not null
    and octet_length(object_name) between 75 and 1024
    and position(chr(92) in object_name) = 0
    and position('//' in object_name) = 0
    and object_name !~ '[[:space:]?#%]'
    and object_name !~ '(^|/)\.{1,2}(/|$)'
    and object_name !~ '/$'
    and split_part(object_name, '/', 1)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(object_name, '/', 2)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and nullif(btrim(split_part(object_name, '/', 3)), '') is not null;
$$;

create or replace function public.can_manage_listing_image_object(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  current_actor uuid := auth.uid();
  path_owner uuid;
  path_listing uuid;
begin
  if current_actor is null
     or not public.is_valid_listing_image_object_name(object_name) then
    return false;
  end if;

  begin
    path_owner := split_part(object_name, '/', 1)::uuid;
    path_listing := split_part(object_name, '/', 2)::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if path_owner <> current_actor then
    return false;
  end if;

  return exists (
    select 1
    from public.listings listing
    join public.profiles owner_profile on owner_profile.id = listing.seller_id
    where listing.id = path_listing
      and listing.seller_id = current_actor
      and listing.status = 'draft'
      and not owner_profile.is_banned
  );
end;
$$;

create or replace function public.validate_listing_image_namespace()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  listing_owner uuid;
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_at = now();
  end if;

  if not public.is_valid_listing_image_object_name(new.storage_path) then
    raise exception 'invalid listing image namespace'
      using errcode = 'check_violation';
  end if;

  select listing.seller_id
  into listing_owner
  from public.listings listing
  where listing.id = new.listing_id;

  if listing_owner is null
     or split_part(new.storage_path, '/', 1)::uuid <> listing_owner
     or split_part(new.storage_path, '/', 2)::uuid <> new.listing_id then
    raise exception 'invalid listing image namespace'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE'
     and auth.uid() is not null
     and (
       new.id is distinct from old.id
       or new.listing_id is distinct from old.listing_id
       or new.storage_path is distinct from old.storage_path
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'listing image identity and object path cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create unique index listing_images_storage_path_idx
  on public.listing_images (storage_path);

create trigger listing_images_validate_namespace
before insert or update on public.listing_images
for each row execute function public.validate_listing_image_namespace();

-- Raw object keys are owner-only metadata while a listing is still a draft.
-- Public and operator reads go through the signer authorization function below.
drop policy if exists listing_images_public_read on public.listing_images;
drop policy if exists listing_images_moderator_read on public.listing_images;
drop policy if exists listing_images_insert_owner on public.listing_images;
drop policy if exists listing_images_moderator_insert on public.listing_images;
drop policy if exists listing_images_update_owner on public.listing_images;
drop policy if exists listing_images_moderator_update on public.listing_images;
drop policy if exists listing_images_delete_owner on public.listing_images;
drop policy if exists listing_images_moderator_delete on public.listing_images;

create policy listing_images_draft_owner_read
  on public.listing_images for select
  to authenticated
  using (
    exists (
      select 1
      from public.listings listing
      where listing.id = listing_id
        and listing.seller_id = (select auth.uid())
        and listing.status = 'draft'
    )
  );

create policy listing_images_draft_owner_insert
  on public.listing_images for insert
  to authenticated
  with check (
    public.can_manage_listing_image_object(storage_path)
    and split_part(storage_path, '/', 2)::uuid = listing_id
  );

create policy listing_images_draft_owner_update
  on public.listing_images for update
  to authenticated
  using (
    public.can_manage_listing_image_object(storage_path)
    and split_part(storage_path, '/', 2)::uuid = listing_id
  )
  with check (
    public.can_manage_listing_image_object(storage_path)
    and split_part(storage_path, '/', 2)::uuid = listing_id
  );

create policy listing_images_draft_owner_delete
  on public.listing_images for delete
  to authenticated
  using (
    public.can_manage_listing_image_object(storage_path)
    and split_part(storage_path, '/', 2)::uuid = listing_id
  );

-- Storage needs narrowly scoped SELECT for INSERT ... RETURNING, upsert, and
-- delete internals. Download, list, info, render, and sign operations do not
-- match this policy, so raw clients cannot mint arbitrarily long read URLs.
drop policy if exists listing_images_owner_mutation_select on storage.objects;
drop policy if exists listing_images_owner_insert on storage.objects;
drop policy if exists listing_images_owner_update on storage.objects;
drop policy if exists listing_images_owner_delete on storage.objects;

create policy listing_images_owner_mutation_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'listing-images'
    and owner_id = (select auth.uid())::text
    and public.can_manage_listing_image_object(name)
    and storage.allow_any_operation(array[
      'storage.object.upload',
      'storage.object.upload_update',
      'storage.object.delete',
      'storage.object.delete_many'
    ])
  );

create policy listing_images_owner_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-images'
    and owner_id = (select auth.uid())::text
    and public.can_manage_listing_image_object(name)
  );

create policy listing_images_owner_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'listing-images'
    and owner_id = (select auth.uid())::text
    and public.can_manage_listing_image_object(name)
  )
  with check (
    bucket_id = 'listing-images'
    and owner_id = (select auth.uid())::text
    and public.can_manage_listing_image_object(name)
  );

create policy listing_images_owner_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-images'
    and owner_id = (select auth.uid())::text
    and public.can_manage_listing_image_object(name)
  );

-- This function returns authorization only, never storage_path. A trusted
-- signer calls it in the caller's JWT context, retrieves the key with the
-- service role only after success, and caps read URL expiry at 600 seconds.
create or replace function public.can_sign_listing_image(image_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.listing_images image
    join public.listings listing on listing.id = image.listing_id
    where image.id = image_id
      and (
        listing.status = 'active'
        or (
          listing.seller_id = auth.uid()
          and listing.status = 'draft'
        )
        or public.is_admin_or_moderator()
      )
  );
$$;

-- Client message inserts cannot pre-mark a message read/deleted or forge time.
create or replace function public.prepare_message_insert()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.sender_id <> auth.uid()
     or new.read_at is not null
     or new.deleted_at is not null then
    raise exception 'message authority fields are server managed'
      using errcode = 'insufficient_privilege';
  end if;

  new.created_at = now();
  new.updated_at = new.created_at;
  return new;
end;
$$;

create trigger messages_prepare_insert
before insert on public.messages
for each row execute function public.prepare_message_insert();

create or replace function public.prevent_message_identity_change()
returns trigger
language plpgsql
as $$
declare
  current_actor uuid := auth.uid();
  conversation_buyer uuid;
  conversation_seller uuid;
begin
  if current_actor is null then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at
     or new.updated_at is distinct from old.updated_at then
    raise exception 'message identity and timestamps are server managed'
      using errcode = 'insufficient_privilege';
  end if;

  select conversation.buyer_id, conversation.seller_id
  into conversation_buyer, conversation_seller
  from public.conversations conversation
  where conversation.id = old.conversation_id;

  if conversation_buyer is null
     or conversation_seller is null
     or current_actor not in (conversation_buyer, conversation_seller) then
    raise exception 'message is not accessible'
      using errcode = 'insufficient_privilege';
  end if;

  if current_actor = old.sender_id then
    if new.read_at is distinct from old.read_at then
      raise exception 'a sender cannot mark their own message read'
        using errcode = 'insufficient_privilege';
    end if;

    if old.deleted_at is not null
       and (
         new.body is distinct from old.body
         or new.deleted_at is distinct from old.deleted_at
       ) then
      raise exception 'a deleted message cannot be changed'
        using errcode = 'insufficient_privilege';
    end if;

    if new.deleted_at is distinct from old.deleted_at then
      if new.deleted_at is null or new.body is distinct from old.body then
        raise exception 'message deletion is one-way and cannot edit content'
          using errcode = 'insufficient_privilege';
      end if;
      new.deleted_at = now();
    elsif new.deleted_at is not null and new.body is distinct from old.body then
      raise exception 'a deleted message cannot be edited'
        using errcode = 'insufficient_privilege';
    end if;
  else
    if new.body is distinct from old.body
       or new.deleted_at is distinct from old.deleted_at
       or new.read_at is null
       or (old.read_at is not null and new.read_at is distinct from old.read_at) then
      raise exception 'a recipient may only mark an unread message read'
        using errcode = 'insufficient_privilege';
    end if;

    if new.read_at is distinct from old.read_at then
      new.read_at = now();
    end if;
  end if;

  return new;
end;
$$;

-- Moderators retain read access for report investigation but cannot author or
-- mutate private conversations. Any exceptional correction uses an audited
-- trusted service path rather than a broad client role policy.
drop policy if exists messages_moderator_insert on public.messages;
drop policy if exists messages_moderator_update on public.messages;

create index messages_unread_by_conversation_idx
  on public.messages (conversation_id, sender_id, created_at desc)
  where read_at is null and deleted_at is null;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_actor uuid := auth.uid();
  affected_rows integer := 0;
begin
  if current_actor is null then
    return 0;
  end if;

  update public.messages message
  set read_at = now()
  where message.conversation_id = p_conversation_id
    and message.sender_id <> current_actor
    and message.read_at is null
    and message.deleted_at is null
    and exists (
      select 1
      from public.conversations conversation
      where conversation.id = p_conversation_id
        and current_actor in (conversation.buyer_id, conversation.seller_id)
    );

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

create or replace function public.get_my_conversation_unread_counts()
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    conversation.id as conversation_id,
    count(message.id) filter (
      where message.sender_id <> auth.uid()
        and message.read_at is null
        and message.deleted_at is null
    )::bigint as unread_count
  from public.conversations conversation
  left join public.messages message on message.conversation_id = conversation.id
  where auth.uid() is not null
    and auth.uid() in (conversation.buyer_id, conversation.seller_id)
  group by conversation.id;
$$;

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_on_message();

-- Persistent Edge Function quotas. The authenticated subject always comes
-- from auth.uid(); there is no client-supplied subject or reset operation.
-- T60 must consume this RPC once before work and map allowed=false to HTTP 429.
-- Conservative MVP budgets are deliberately fixed here so an untrusted caller
-- cannot raise its own limit: recommendation 10/minute, image analysis 3/5 min.
create table public.edge_function_rate_limits (
  subject_id uuid not null references public.profiles (id) on delete cascade,
  operation text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null,
  primary key (subject_id, operation),
  constraint edge_function_rate_limit_operation
    check (operation in ('recommend-listings', 'analyze-listing')),
  constraint edge_function_rate_limit_count
    check (request_count between 1 and 1000)
);

alter table public.edge_function_rate_limits enable row level security;
revoke all on public.edge_function_rate_limits from public;

create or replace function public.consume_edge_function_quota(p_operation text)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz,
  limit_value integer,
  window_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_actor uuid := auth.uid();
  quota_limit integer;
  quota_window_seconds integer;
  quota_now timestamptz := clock_timestamp();
  stored_window_started_at timestamptz;
  stored_request_count integer;
begin
  case p_operation
    when 'recommend-listings' then
      quota_limit := 10;
      quota_window_seconds := 60;
    when 'analyze-listing' then
      quota_limit := 3;
      quota_window_seconds := 300;
    else
      raise exception 'unsupported Edge Function quota operation'
        using errcode = 'invalid_parameter_value';
  end case;

  if current_actor is null
     or not exists (
       select 1
       from public.profiles profile
       where profile.id = current_actor and not profile.is_banned
     ) then
    raise exception 'authenticated active profile required for quota consumption'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.edge_function_rate_limits as existing (
    subject_id,
    operation,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    current_actor,
    p_operation,
    quota_now,
    1,
    quota_now
  )
  on conflict (subject_id, operation) do update
  set window_started_at = case
        when existing.window_started_at
          + make_interval(secs => quota_window_seconds) <= quota_now then quota_now
        else existing.window_started_at
      end,
      request_count = case
        when existing.window_started_at
          + make_interval(secs => quota_window_seconds) <= quota_now then 1
        else least(existing.request_count + 1, quota_limit + 1)
      end,
      updated_at = quota_now
  returning window_started_at, request_count
  into stored_window_started_at, stored_request_count;

  return query
  select
    stored_request_count <= quota_limit,
    greatest(quota_limit - stored_request_count, 0),
    stored_window_started_at + make_interval(secs => quota_window_seconds),
    quota_limit,
    quota_window_seconds;
end;
$$;

revoke execute on function public.consume_edge_function_quota(text) from public;

-- Realtime emits only rows the subscriber can SELECT under table RLS.
-- FULL identity makes participant updates usable by filtered subscriptions;
-- deletes remain primary-key-only under RLS and chat uses soft deletion.
alter table public.messages replica identity full;
alter table public.conversations replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) then
    execute 'create publication supabase_realtime';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    execute 'alter publication supabase_realtime add table public.conversations';
  end if;
end;
$$;

revoke execute on function public.can_manage_listing_image_object(text) from public;
revoke execute on function public.can_sign_listing_image(uuid) from public;
revoke execute on function public.validate_listing_image_namespace() from public;
revoke execute on function public.prepare_message_insert() from public;
revoke execute on function public.prevent_message_identity_change() from public;
revoke execute on function public.mark_conversation_read(uuid) from public;
revoke execute on function public.get_my_conversation_unread_counts() from public;
revoke execute on function public.touch_conversation_on_message() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.can_sign_listing_image(uuid) to anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.can_manage_listing_image_object(text) to authenticated;
    grant execute on function public.can_sign_listing_image(uuid) to authenticated;
    grant execute on function public.mark_conversation_read(uuid) to authenticated;
    grant execute on function public.get_my_conversation_unread_counts() to authenticated;
    grant execute on function public.consume_edge_function_quota(text) to authenticated;
  end if;
end;
$$;

commit;

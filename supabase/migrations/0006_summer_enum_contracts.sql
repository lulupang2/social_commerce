-- Migrate retired category values and enforce the shared SummerGear enum contract.

begin;

update public.listings
set category = case category::text
  when 'protective_gear' then 'protective'::public.listing_category
  when 'parts' then 'accessories'::public.listing_category
  else category
end
where category::text in ('protective_gear', 'parts');

alter table public.listings
  add constraint listings_category_summer_allowed
  check (category::text in (
    'equipment',
    'apparel',
    'footwear',
    'protective',
    'accessories',
    'other'
  ));

alter table public.publication_audit_events
  drop constraint publication_audit_action;

alter table public.publication_audit_events
  add constraint publication_audit_action
  check (action in ('publish', 'reject', 'archive', 'hide', 'remove', 'restore'));

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
    or (old.status = 'pending_review' and new.status in ('draft', 'active', 'rejected', 'archived', 'removed'))
    or (old.status = 'rejected' and new.status in ('draft', 'removed'))
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
        and (
          (old.status = 'draft' and new.status = 'pending_review')
          or (old.status = 'rejected' and new.status = 'draft')
        ) then
    null;
  else
    raise exception 'only an operator may publish or moderate a listing'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status = 'active' and old.status <> 'active' then
    new.published_at = coalesce(old.published_at, now());
  elsif new.status in ('draft', 'pending_review', 'rejected') then
    new.published_at = null;
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
  current_app_role public.app_role;
  event_action text;
  event_target_type text;
begin
  if old.status::text = new.status::text or current_actor is null then
    return new;
  end if;

  select profile.role
  into current_app_role
  from public.profiles profile
  where profile.id = current_actor
    and profile.role in ('moderator', 'admin')
    and not profile.is_banned;

  if current_app_role is null then
    return new;
  end if;

  event_target_type := case tg_table_name
    when 'listings' then 'listing'
    when 'community_posts' then 'community_post'
  end;

  event_action := case
    when new.status::text = 'active' and old.status::text in ('archived', 'hidden') then 'restore'
    when new.status::text = 'active' then 'publish'
    when new.status::text = 'rejected' then 'reject'
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
      current_app_role,
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

commit;

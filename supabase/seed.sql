-- Canonical reference data only. Auth-linked profiles and user content are
-- created after signup; this seed is safe to run in every environment.

insert into public.sports (id, slug, name, description)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'surf',
    '서핑',
    '숏보드·롱보드·펀보드·웻슈트·핀·리시 및 워터스포츠 용품'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'tennis',
    '테니스',
    '테니스 라켓·가방·올코트화·스트링·그립 및 라켓스포츠 용품'
  )
on conflict (id) do update
set slug = excluded.slug,
    name = excluded.name,
    description = excluded.description,
    is_active = true,
    updated_at = now();

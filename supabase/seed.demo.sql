-- SummerGear deterministic demo marketplace data.
--
-- Development/demo only; never apply this file to a production project.
-- Every identity and item below is fictional. No email, credential, precise address,
-- real-person profile, or production-only identifier is included.
--
-- Fixed namespaces:
--   sports       11111111... (surf) / 22222222... (tennis)
--   auth/profile aaaaaaaa... / bbbbbbbb... / cccccccc...
--   listings     10000000-0000-4000-8000-000000000001..014
--   posts        30000000-0000-4000-8000-000000000001..004

begin;

insert into public.sports (
  id, slug, name, description, is_active, created_at, updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'surf',
    '서핑',
    '숏보드·롱보드·펀보드·웻슈트·핀·리시 및 워터스포츠 용품',
    true,
    timestamptz '2026-08-01 09:00:00+09',
    timestamptz '2026-08-01 09:00:00+09'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'tennis',
    '테니스',
    '테니스 라켓·테니스 가방·올코트화·스트링·그립 및 라켓스포츠 용품',
    true,
    timestamptz '2026-08-01 09:00:00+09',
    timestamptz '2026-08-01 09:00:00+09'
  )
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    is_active = excluded.is_active,
    updated_at = excluded.updated_at
where (public.sports.name, public.sports.description, public.sports.is_active)
  is distinct from (excluded.name, excluded.description, excluded.is_active);

insert into auth.users (
  id, aud, role, raw_app_meta_data, raw_user_meta_data,
  is_anonymous, created_at, updated_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated',
    'authenticated',
    '{"provider":"demo","summergear_demo":true}'::jsonb,
    '{"display_name":"데모 양양서프하우스"}'::jsonb,
    true,
    timestamptz '2026-08-01 09:10:00+09',
    timestamptz '2026-08-01 09:10:00+09'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated',
    'authenticated',
    '{"provider":"demo","summergear_demo":true}'::jsonb,
    '{"display_name":"데모 송정웨이브샵"}'::jsonb,
    true,
    timestamptz '2026-08-01 09:20:00+09',
    timestamptz '2026-08-01 09:20:00+09'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'authenticated',
    'authenticated',
    '{"provider":"demo","summergear_demo":true}'::jsonb,
    '{"display_name":"데모 코트마스터"}'::jsonb,
    true,
    timestamptz '2026-08-01 09:30:00+09',
    timestamptz '2026-08-01 09:30:00+09'
  )
on conflict (id) do update
set aud = excluded.aud,
    role = excluded.role,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    is_anonymous = excluded.is_anonymous,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.profiles (
  id, handle, display_name, bio, role, is_banned, created_at, updated_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'demo_surf_house',
    '데모 양양서프하우스',
    '시연용 서핑 장비 프로필입니다. 실제 인물이나 상점이 아닙니다.',
    'user',
    false,
    timestamptz '2026-08-01 09:10:00+09',
    timestamptz '2026-08-01 09:10:00+09'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'demo_wave_shop',
    '데모 송정웨이브샵',
    '시연용 서핑 장비 프로필입니다. 실제 인물이나 상점이 아닙니다.',
    'user',
    false,
    timestamptz '2026-08-01 09:20:00+09',
    timestamptz '2026-08-01 09:20:00+09'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'demo_court_master',
    '데모 코트마스터',
    '시연용 테니스 장비 프로필입니다. 실제 인물이나 상점이 아닙니다.',
    'user',
    false,
    timestamptz '2026-08-01 09:30:00+09',
    timestamptz '2026-08-01 09:30:00+09'
  )
on conflict (id) do update
set handle = excluded.handle,
    display_name = excluded.display_name,
    bio = excluded.bio,
    role = excluded.role,
    is_banned = excluded.is_banned,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

insert into public.listings (
  id, seller_id, sport_id, category, title, description, price, currency,
  condition, status, details, location_text, published_at, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'equipment',
    '[데모] Channel Islands Happy Everyday 숏보드 5''11" (32L)',
    '작년 여름 3회 입수한 극미중고입니다. 딩이나 덴트 일절 없고 FCS2 핀 포함 구성입니다.',
    680000,
    'KRW',
    'like_new',
    'active',
    '{"sport":"surf","brand":"Channel Islands","model":"Happy Everyday","equipmentType":"surfboard","discipline":"shortboard","boardLengthFeet":5.11,"volumeLiters":32.6,"finSystem":"fcs2","finIncluded":true}'::jsonb,
    '강원 양양군',
    timestamptz '2026-08-13 18:30:00+09',
    timestamptz '2026-08-13 18:30:00+09',
    timestamptz '2026-08-13 18:30:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    'equipment',
    '[데모] Torq TET Mod Fun 7''2" 펀보드 (47L)',
    '초보자부터 중급자까지 타기 좋은 고부력 펀보드입니다. 리시와 핀 포함입니다.',
    490000,
    'KRW',
    'good',
    'active',
    '{"sport":"surf","brand":"Torq","model":"Mod Fun","equipmentType":"surfboard","discipline":"funboard","boardLengthFeet":7.2,"volumeLiters":47.2,"finSystem":"futures","finIncluded":true}'::jsonb,
    '부산 해운대구 송정',
    timestamptz '2026-08-12 20:15:00+09',
    timestamptz '2026-08-12 20:15:00+09',
    timestamptz '2026-08-12 20:15:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'equipment',
    '[데모] Wilson Pro Staff 97 v14 라켓 (315g, G2)',
    '프레임 기스 없이 깨끗한 프로스태프 v14 315g입니다. 럭실론 알루파워 작업되어 있습니다.',
    240000,
    'KRW',
    'like_new',
    'active',
    '{"sport":"tennis","brand":"Wilson","model":"Pro Staff 97 v14","equipmentType":"racket","headSizeSqIn":97,"weightGrams":315,"gripSize":"2","playStyle":"all_court","strung":true}'::jsonb,
    '서울 강남구',
    timestamptz '2026-08-11 19:40:00+09',
    timestamptz '2026-08-11 19:40:00+09',
    timestamptz '2026-08-11 19:40:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'equipment',
    '[데모] Babolat Pure Aero 2023 (300g, 100sq.in, G2)',
    '강력한 스핀의 퓨어에어로 라켓입니다. 범퍼 가드 생활 기스 외 크랙 없습니다.',
    210000,
    'KRW',
    'good',
    'active',
    '{"sport":"tennis","brand":"Babolat","model":"Pure Aero","equipmentType":"racket","headSizeSqIn":100,"weightGrams":300,"gripSize":"2","playStyle":"baseline_aggressive","strung":true}'::jsonb,
    '경기 성남시 분당구',
    timestamptz '2026-08-10 17:20:00+09',
    timestamptz '2026-08-10 17:20:00+09',
    timestamptz '2026-08-10 17:20:00+09'
  )
on conflict (id) do update
set seller_id = excluded.seller_id,
    sport_id = excluded.sport_id,
    category = excluded.category,
    title = excluded.title,
    description = excluded.description,
    price = excluded.price,
    currency = excluded.currency,
    condition = excluded.condition,
    status = excluded.status,
    details = excluded.details,
    location_text = excluded.location_text,
    published_at = excluded.published_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

commit;

-- SummerGear deterministic demo marketplace data.
--
-- Development/demo only; never apply this file to a production project.
-- Every identity and item below is fictional. No email, credential, precise address,
-- real-person profile, or production-only identifier is included.
--
-- Fixed namespaces:
--   sports       11111111... (surf) / 22222222... (tennis)
--   auth/profile aaaaaaaa... / bbbbbbbb... / cccccccc...
--   listings     10000000-0000-4000-8000-000000000001..006
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
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    'apparel',
    '[데모] O''Neill Hyperfreak 3/2mm 풀슈트 웻슈트 (M)',
    '담수 세척과 그늘 건조를 지켜 관리했습니다. 두 번 착용해 신축성과 지퍼 상태가 좋습니다.',
    180000,
    'KRW',
    'like_new',
    'active',
    '{"sport":"surf","brand":"O''Neill","model":"Hyperfreak","equipmentType":"wetsuit","size":"M","wetsuitThickness":"3_2mm"}'::jsonb,
    '제주 서귀포시 중문',
    timestamptz '2026-08-09 11:10:00+09',
    timestamptz '2026-08-09 11:10:00+09',
    timestamptz '2026-08-09 11:10:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'footwear',
    '[데모] Nike Court Air Zoom Vapor Pro 2 올코트화 270mm',
    '실내 하드코트에서 두 번 신었습니다. 아웃솔 마모가 거의 없고 정품 박스를 포함합니다.',
    95000,
    'KRW',
    'like_new',
    'active',
    '{"sport":"tennis","brand":"Nike","model":"Air Zoom Vapor Pro 2","equipmentType":"shoes","shoeSizeMm":270}'::jsonb,
    '서울 송파구 잠실동',
    timestamptz '2026-08-08 15:30:00+09',
    timestamptz '2026-08-08 15:30:00+09',
    timestamptz '2026-08-08 15:30:00+09'
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

insert into public.community_posts (
  id,
  author_id,
  sport_id,
  post_type,
  title,
  body,
  status,
  published_at,
  created_at,
  updated_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'guide',
    '양양 입문 서퍼를 위한 라인업 에티켓과 파도 보는 법',
    '피크 우선권과 패들 아웃 동선을 먼저 확인하세요. 입수 전 10분 동안 세트 주기와 이안류 위치를 보는 습관이 안전한 세션을 만듭니다.',
    'active',
    timestamptz '2026-08-14 08:00:00+09',
    timestamptz '2026-08-14 08:00:00+09',
    timestamptz '2026-08-14 08:00:00+09'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'review',
    '프로스태프 v14와 스피드 MP 한 달 사용 비교',
    '컨트롤 중심인 프로스태프와 스핀·반발력이 좋은 스피드 MP를 번갈아 사용했습니다. 스트로크 임팩트와 발리 반응에서 느낀 차이를 정리합니다.',
    'active',
    timestamptz '2026-08-13 19:30:00+09',
    timestamptz '2026-08-13 19:30:00+09',
    timestamptz '2026-08-13 19:30:00+09'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    'meetup',
    '[토요일] 양양 죽도 새벽 세션 카풀 두 분 모집',
    '새벽 4시 서울 잠실에서 출발해 양양 죽도로 갑니다. 보드 적재 가능하고 세션 뒤 함께 식사할 분을 찾습니다.',
    'active',
    timestamptz '2026-08-12 21:00:00+09',
    timestamptz '2026-08-12 21:00:00+09',
    timestamptz '2026-08-12 21:00:00+09'
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'meetup',
    '서울 반포 일요일 복식 게스트 모집',
    '일요일 저녁 반포 코트에서 NTRP 2.5~3.5 복식 경기를 진행합니다. 매너 있게 두 시간 함께 뛸 게스트를 모집합니다.',
    'active',
    timestamptz '2026-08-11 18:00:00+09',
    timestamptz '2026-08-11 18:00:00+09',
    timestamptz '2026-08-11 18:00:00+09'
  )
on conflict (id) do update
set author_id = excluded.author_id,
    sport_id = excluded.sport_id,
    post_type = excluded.post_type,
    title = excluded.title,
    body = excluded.body,
    status = excluded.status,
    published_at = excluded.published_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

commit;

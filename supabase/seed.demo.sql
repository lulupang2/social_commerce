-- IceGear deterministic demo marketplace data.
--
-- Development/demo only; never apply this file to a production project.
-- Every identity and item below is fictional. No email, credential, precise address,
-- real-person profile, or production-only identifier is included.
--
-- Fixed namespaces:
--   sports       11111111... / 22222222...
--   auth/profile aaaaaaaa... / bbbbbbbb... / cccccccc...
--   listings     10000000-0000-4000-8000-000000000001..014
--   posts        30000000-0000-4000-8000-000000000001..004
--
-- The upserts and fixed display timestamps make repeated runs duplicate-free and
-- keep feed ordering stable. Active rows represent already-reviewed demo fixtures;
-- ordinary application authors must still create drafts through the normal boundary.
-- Demo listings intentionally omit image metadata so the UI fallback is exercised.
-- Private images must be uploaded through a supported path before their object keys are seeded.

begin;

insert into public.sports (
  id, slug, name, description, is_active, created_at, updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'ski',
    '스키',
    '알파인·프리라이드·투어링 스키와 부츠, 의류, 보호 장비',
    true,
    timestamptz '2026-08-01 09:00:00+09',
    timestamptz '2026-08-01 09:00:00+09'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'hockey',
    '아이스하키',
    '아이스하키 스케이트, 스틱, 보호 장비와 팀웨어',
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
    '{"provider":"demo","icegear_demo":true}'::jsonb,
    '{"display_name":"데모 설원창고"}'::jsonb,
    true,
    timestamptz '2026-08-01 09:10:00+09',
    timestamptz '2026-08-01 09:10:00+09'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated',
    'authenticated',
    '{"provider":"demo","icegear_demo":true}'::jsonb,
    '{"display_name":"데모 슬로프정비실"}'::jsonb,
    true,
    timestamptz '2026-08-01 09:20:00+09',
    timestamptz '2026-08-01 09:20:00+09'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'authenticated',
    'authenticated',
    '{"provider":"demo","icegear_demo":true}'::jsonb,
    '{"display_name":"데모 링크라커"}'::jsonb,
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
    updated_at = excluded.updated_at
where (
  auth.users.aud,
  auth.users.role,
  auth.users.raw_app_meta_data,
  auth.users.raw_user_meta_data,
  auth.users.is_anonymous,
  auth.users.created_at
) is distinct from (
  excluded.aud,
  excluded.role,
  excluded.raw_app_meta_data,
  excluded.raw_user_meta_data,
  excluded.is_anonymous,
  excluded.created_at
);

insert into public.profiles (
  id, handle, display_name, bio, role, is_banned, created_at, updated_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'demo_snow_shelf',
    '데모 설원창고',
    '시연용 스키 장비 프로필입니다. 실제 인물이나 상점이 아닙니다.',
    'user',
    false,
    timestamptz '2026-08-01 09:10:00+09',
    timestamptz '2026-08-01 09:10:00+09'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'demo_slope_room',
    '데모 슬로프정비실',
    '시연용 스키 장비 프로필입니다. 실제 인물이나 상점이 아닙니다.',
    'user',
    false,
    timestamptz '2026-08-01 09:20:00+09',
    timestamptz '2026-08-01 09:20:00+09'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'demo_rink_locker',
    '데모 링크라커',
    '시연용 아이스하키 장비 프로필입니다. 실제 인물이나 상점이 아닙니다.',
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
    updated_at = excluded.updated_at
where (
  public.profiles.handle,
  public.profiles.display_name,
  public.profiles.bio,
  public.profiles.role,
  public.profiles.is_banned,
  public.profiles.created_at
) is distinct from (
  excluded.handle,
  excluded.display_name,
  excluded.bio,
  excluded.role,
  excluded.is_banned,
  excluded.created_at
);

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
    '[데모] 살로몬 QST 98 176cm 바인딩 세트',
    '23/24 시즌 기준 6회 사용한 올마운틴 스키입니다. 상판에 옅은 사용 흔적이 있고 베이스와 엣지는 왁싱 후 보관했습니다. 바인딩은 포함하고 부츠는 포함하지 않습니다.',
    480000,
    'KRW',
    'good',
    'active',
    '{"brand":"Salomon","model":"QST 98","year":2024,"equipmentType":"skis","discipline":"freeride","lengthCm":176,"waistWidthMm":98,"bindingIncluded":true,"notes":"데모 상품"}'::jsonb,
    '서울 송파구',
    timestamptz '2026-08-13 18:30:00+09',
    timestamptz '2026-08-13 18:30:00+09',
    timestamptz '2026-08-13 18:30:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    'equipment',
    '[데모] 로시뇰 Experience 88 Ti 172cm',
    '두 시즌 사용한 올라운드 스키입니다. 베이스에 얕은 스크래치와 상판 사용 흔적이 있으며 보관 전 왁싱했습니다. 바인딩을 포함한 구성입니다.',
    390000,
    'KRW',
    'good',
    'active',
    '{"brand":"Rossignol","model":"Experience 88 Ti","year":2022,"equipmentType":"skis","discipline":"alpine","lengthCm":172,"waistWidthMm":88,"bindingIncluded":true,"notes":"데모 상품"}'::jsonb,
    '강원 춘천시',
    timestamptz '2026-08-12 20:15:00+09',
    timestamptz '2026-08-12 20:15:00+09',
    timestamptz '2026-08-12 20:15:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    'equipment',
    '[데모] 아토믹 Hawx Prime 100 스키 부츠 265mm',
    '몬도포인트 26.5, 플렉스 100 모델입니다. 열성형은 한 번 했고 이너는 건조해 보관했습니다. 버클과 스트랩의 작동 상태를 확인했습니다.',
    220000,
    'KRW',
    'good',
    'active',
    '{"brand":"Atomic","model":"Hawx Prime 100","year":2023,"equipmentType":"boots","bootMondopointMm":265,"bootFlex":100,"gender":"unisex","notes":"데모 상품"}'::jsonb,
    '강원 원주시',
    timestamptz '2026-08-11 19:40:00+09',
    timestamptz '2026-08-11 19:40:00+09',
    timestamptz '2026-08-11 19:40:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'equipment',
    '[데모] 블랙크로우 Camox Freebird 178cm',
    '투어링 스키 플레이트 단품입니다. 한 시즌 세 번 사용해 상판에 가벼운 흔적이 있습니다. 바인딩과 스킨은 포함하지 않습니다.',
    650000,
    'KRW',
    'like_new',
    'active',
    '{"brand":"Black Crows","model":"Camox Freebird","year":2024,"equipmentType":"skis","discipline":"touring","lengthCm":178,"waistWidthMm":95,"bindingIncluded":false,"notes":"데모 상품"}'::jsonb,
    '서울 마포구',
    timestamptz '2026-08-10 17:20:00+09',
    timestamptz '2026-08-10 17:20:00+09',
    timestamptz '2026-08-10 17:20:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'accessories',
    '[데모] 스미스 Squad MAG 고글 렌즈 2장',
    '주간용 렌즈와 저조도용 렌즈를 함께 드립니다. 프레임과 밴드는 깨끗한 편이고 렌즈에는 사용 중 생긴 미세한 흔적이 있습니다.',
    120000,
    'KRW',
    'good',
    'active',
    '{"brand":"Smith","model":"Squad MAG","year":2024,"equipmentType":"goggles","gender":"unisex","notes":"주간용·저조도용 렌즈 포함, 데모 상품"}'::jsonb,
    '서울 용산구',
    timestamptz '2026-08-09 14:05:00+09',
    timestamptz '2026-08-09 14:05:00+09',
    timestamptz '2026-08-09 14:05:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    'apparel',
    '[데모] 데상트 남성 스키 재킷 M',
    '검정색 남성 M 사이즈로 한 시즌 다섯 번 착용했습니다. 지퍼는 모두 작동하고 소매 끝에 가벼운 사용 흔적이 있습니다. 세탁 후 보관했습니다.',
    180000,
    'KRW',
    'good',
    'active',
    '{"brand":"Descente","model":"Ski Jacket","year":2023,"equipmentType":"jacket","size":"M","gender":"men","notes":"데모 상품"}'::jsonb,
    '강원 평창군',
    timestamptz '2026-08-08 11:30:00+09',
    timestamptz '2026-08-08 11:30:00+09',
    timestamptz '2026-08-08 11:30:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000007',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    'protective_gear',
    '[데모] POC Obex MIPS 스키 헬멧 M',
    'M 사이즈 헬멧으로 외관에 가벼운 마찰 흔적이 있습니다. 보호 장비이므로 사진과 설명만으로 상태를 판단하지 말고 거래 전에 사용 이력과 내부 상태를 직접 확인해주세요.',
    160000,
    'KRW',
    'good',
    'active',
    '{"brand":"POC","model":"Obex MIPS","year":2024,"equipmentType":"helmet","size":"M","gender":"unisex","notes":"상태 직접 확인 필요, 데모 상품"}'::jsonb,
    '서울 광진구',
    timestamptz '2026-08-07 10:10:00+09',
    timestamptz '2026-08-07 10:10:00+09',
    timestamptz '2026-08-07 10:10:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000008',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'equipment',
    '[데모] CCM Jetspeed FT6 Pro 스케이트 270mm',
    '270mm 표기, 레귤러 발볼 모델입니다. 열성형은 한 번 했고 러너에는 연마 사용 흔적이 있습니다. 사이즈 차이가 있을 수 있어 직접 착화 후 결정해주세요.',
    320000,
    'KRW',
    'good',
    'active',
    '{"brand":"CCM","model":"Jetspeed FT6 Pro","year":2024,"equipmentType":"skates","format":"ice","skateSize":8.5,"skateWidth":"Regular","notes":"270mm 표기, 데모 상품"}'::jsonb,
    '서울 송파구',
    timestamptz '2026-08-13 12:10:00+09',
    timestamptz '2026-08-13 12:10:00+09',
    timestamptz '2026-08-13 12:10:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000009',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'equipment',
    '[데모] 바우어 Vapor Hyperlite 스틱 77플렉스 좌',
    '왼손잡이용 77플렉스, P92 커브입니다. 길이는 약 152cm이고 샤프트와 블레이드에 일반적인 퍽 자국이 있습니다. 기존 테이프는 제거했습니다.',
    180000,
    'KRW',
    'good',
    'active',
    '{"brand":"Bauer","model":"Vapor Hyperlite","year":2023,"equipmentType":"stick","format":"ice","position":"forward","handedness":"left","stickFlex":77,"stickLengthCm":152,"curve":"P92","kickPoint":"low","notes":"데모 상품"}'::jsonb,
    '서울 강동구',
    timestamptz '2026-08-12 17:45:00+09',
    timestamptz '2026-08-12 17:45:00+09',
    timestamptz '2026-08-12 17:45:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000010',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'protective_gear',
    '[데모] 워리어 Alpha DX 하키 글러브 14인치',
    '14인치 성인용 글러브입니다. 손바닥에 사용 흔적은 있지만 뚫린 부분은 보이지 않고 손목 보호대와 봉제 상태를 확인했습니다.',
    90000,
    'KRW',
    'good',
    'active',
    '{"brand":"Warrior","model":"Alpha DX","year":2022,"equipmentType":"gloves","format":"ice","size":"14","position":"any","notes":"데모 상품"}'::jsonb,
    '경기 성남시',
    timestamptz '2026-08-11 16:25:00+09',
    timestamptz '2026-08-11 16:25:00+09',
    timestamptz '2026-08-11 16:25:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000011',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'protective_gear',
    '[데모] 바우어 Re-Akt 150 하키 헬멧 M',
    '검정색 M 사이즈 헬멧입니다. 외관과 패드에 사용 흔적이 있습니다. 보호 장비이므로 거래 전에 사용 이력, 균열 여부와 착용 상태를 직접 확인해주세요.',
    130000,
    'KRW',
    'good',
    'active',
    '{"brand":"Bauer","model":"Re-Akt 150","year":2024,"equipmentType":"helmet","format":"ice","size":"M","position":"any","notes":"상태 직접 확인 필요, 데모 상품"}'::jsonb,
    '서울 서초구',
    timestamptz '2026-08-10 15:00:00+09',
    timestamptz '2026-08-10 15:00:00+09',
    timestamptz '2026-08-10 15:00:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000012',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'protective_gear',
    '[데모] CCM Tacks AS-V 숄더패드 M',
    '성인 M 사이즈 숄더패드입니다. 가슴과 어깨 폼에 눌림 흔적이 있고 스트랩과 벨크로는 작동합니다. 직접 착용해 움직임과 상태를 확인해주세요.',
    150000,
    'KRW',
    'good',
    'active',
    '{"brand":"CCM","model":"Tacks AS-V","year":2023,"equipmentType":"shoulder_pads","format":"ice","size":"M","position":"defense","notes":"데모 상품"}'::jsonb,
    '경기 고양시',
    timestamptz '2026-08-09 13:15:00+09',
    timestamptz '2026-08-09 13:15:00+09',
    timestamptz '2026-08-09 13:15:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000013',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'apparel',
    '[데모] CCM 아이스하키 연습 저지 L',
    '성인 L 사이즈 네이비 연습 저지입니다. 이름과 등번호 마킹이 없고 세탁 후 보관했습니다. 소매 끝에 가벼운 사용 흔적이 있습니다.',
    60000,
    'KRW',
    'good',
    'active',
    '{"brand":"CCM","model":"Practice Jersey","year":2023,"equipmentType":"jersey","format":"ice","size":"L","gender":"unisex","notes":"마킹 없음, 데모 상품"}'::jsonb,
    '경기 안양시',
    timestamptz '2026-08-08 10:40:00+09',
    timestamptz '2026-08-08 10:40:00+09',
    timestamptz '2026-08-08 10:40:00+09'
  ),
  (
    '10000000-0000-4000-8000-000000000014',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'accessories',
    '[데모] CCM 하키 장비 가방 36인치',
    '스케이트와 성인 보호 장비를 넣을 수 있는 36인치 가방입니다. 지퍼는 모두 작동하고 바닥면과 손잡이에 사용 흔적이 있습니다.',
    85000,
    'KRW',
    'fair',
    'active',
    '{"brand":"CCM","model":"Team Carry Bag 36","year":2021,"equipmentType":"bag","format":"ice","size":"36 inch","gender":"unisex","notes":"데모 상품"}'::jsonb,
    '서울 중구',
    timestamptz '2026-08-07 09:20:00+09',
    timestamptz '2026-08-07 09:20:00+09',
    timestamptz '2026-08-07 09:20:00+09'
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
    updated_at = excluded.updated_at
where (
  public.listings.seller_id,
  public.listings.sport_id,
  public.listings.category,
  public.listings.title,
  public.listings.description,
  public.listings.price,
  public.listings.currency,
  public.listings.condition,
  public.listings.status,
  public.listings.details,
  public.listings.location_text,
  public.listings.published_at,
  public.listings.created_at
) is distinct from (
  excluded.seller_id,
  excluded.sport_id,
  excluded.category,
  excluded.title,
  excluded.description,
  excluded.price,
  excluded.currency,
  excluded.condition,
  excluded.status,
  excluded.details,
  excluded.location_text,
  excluded.published_at,
  excluded.created_at
);

-- listing_images are intentionally not seeded. Private Storage metadata must reference
-- real licensed objects; URL placeholders and metadata for nonexistent bytes are invalid.

-- Demo community posts span realistic content categories (question, review, guide, discussion)
-- matching the canonical community_post_type enum values.
insert into public.community_posts (
  id, author_id, sport_id, post_type, title, body, status, published_at, created_at, updated_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'question',
    '[데모] 첫 스키 길이, 키보다 얼마나 짧게 보세요?',
    '키 168cm이고 이번 시즌부터 완만한 슬로프에서 기본 턴을 연습하려고 해요. 158~165cm 사이를 보고 있는데 처음 고를 때 길이 외에 회전 반경이나 허리 폭도 함께 확인하셨는지 궁금합니다.',
    'active',
    timestamptz '2026-08-13 09:30:00+09',
    timestamptz '2026-08-13 09:30:00+09',
    timestamptz '2026-08-13 09:30:00+09'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'review',
    '[데모] 하키 스케이트 피팅 때 확인한 네 가지',
    '처음 스케이트를 맞출 때 길이만 보지 않고 발볼, 뒤꿈치 고정, 발가락 여유, 열성형 가능 여부를 차례로 확인했어요. 브랜드마다 체감 사이즈가 달라서 같은 표기라도 양쪽을 직접 신어보는 편이 좋았습니다.',
    'active',
    timestamptz '2026-08-11 20:00:00+09',
    timestamptz '2026-08-11 20:00:00+09',
    timestamptz '2026-08-11 20:00:00+09'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    'guide',
    '[데모] 시즌 전 중고 스키 점검 순서 공유해요',
    '저는 바인딩 구성과 부츠 호환 여부를 먼저 확인하고 상판, 사이드월, 엣지, 베이스 순서로 살펴봐요. 수리 흔적과 보관 상태도 물어보고 가능하면 밝은 곳에서 양쪽을 나란히 확인합니다.',
    'active',
    timestamptz '2026-08-09 16:40:00+09',
    timestamptz '2026-08-09 16:40:00+09',
    timestamptz '2026-08-09 16:40:00+09'
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'discussion',
    '[데모] 입문자 하키 장비, 어디부터 맞추셨나요?',
    '대여 장비로 연습을 시작했고 이제 스케이트와 보호 장비를 하나씩 준비하려고 해요. 예산을 나눌 때 먼저 직접 맞춰야 했던 장비와 중고로 고를 때 확인한 항목을 알려주시면 참고하겠습니다.',
    'active',
    timestamptz '2026-08-07 18:15:00+09',
    timestamptz '2026-08-07 18:15:00+09',
    timestamptz '2026-08-07 18:15:00+09'
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
    updated_at = excluded.updated_at
where (
  public.community_posts.author_id,
  public.community_posts.sport_id,
  public.community_posts.post_type,
  public.community_posts.title,
  public.community_posts.body,
  public.community_posts.status,
  public.community_posts.published_at,
  public.community_posts.created_at
) is distinct from (
  excluded.author_id,
  excluded.sport_id,
  excluded.post_type,
  excluded.title,
  excluded.body,
  excluded.status,
  excluded.published_at,
  excluded.created_at
);

do $$
begin
  if (
    select count(*)
    from public.profiles
    where id in (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    )
  ) <> 3 then
    raise exception 'Expected 3 demo profiles';
  end if;

  if (
    select count(*)
    from public.listings
    where id::text like '10000000-0000-4000-8000-%'
  ) <> 14 then
    raise exception 'Expected 14 demo listings';
  end if;

  if (
    select count(*)
    from public.community_posts
    where id::text like '30000000-0000-4000-8000-%'
  ) <> 4 then
    raise exception 'Expected 4 demo community posts';
  end if;

  if (
    select count(distinct post_type)
    from public.community_posts
    where id::text like '30000000-0000-4000-8000-%'
  ) <> 4 then
    raise exception 'Expected 4 distinct demo community post types';
  end if;

  if exists (
    select 1
    from public.community_posts
    where id::text like '30000000-0000-4000-8000-%'
      and post_type not in ('discussion', 'question', 'guide', 'meetup', 'review')
  ) then
    raise exception 'Demo community posts must use valid community_post_type enum values';
  end if;

  if exists (
    select 1
    from public.listing_images
    where listing_id::text like '10000000-0000-4000-8000-%'
  ) then
    raise exception 'Demo listings must remain image-less until private objects are uploaded';
  end if;
end;
$$;

commit;

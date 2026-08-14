-- IceGear demo marketplace data.
--
-- Development/demo only. Sellers are anonymous Supabase Auth records used only
-- to satisfy the profile foreign key. They are not real login accounts.
-- This file is idempotent and can be run repeatedly.

begin;

insert into public.sports (id, slug, name, description, is_active)
values
  ('11111111-1111-4111-8111-111111111111', 'ski', 'Ski', 'Skis, boots, bindings, apparel, and accessories.', true),
  ('22222222-2222-4222-8222-222222222222', 'hockey', 'Hockey', 'Ice hockey equipment and apparel.', true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true,
    updated_at = now();

insert into auth.users (
  id, aud, role, raw_app_meta_data, raw_user_meta_data,
  is_anonymous, created_at, updated_at
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
   '{"provider":"demo"}'::jsonb, '{"display_name":"Seoul Snow Depot"}'::jsonb, true, now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
   '{"provider":"demo"}'::jsonb, '{"display_name":"Gangwon Gear Room"}'::jsonb, true, now(), now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated',
   '{"provider":"demo"}'::jsonb, '{"display_name":"Rink Buddy"}'::jsonb, true, now(), now())
on conflict (id) do update
set raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = now();

insert into public.profiles (id, handle, display_name, bio, role, is_banned)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'seoul_snow', 'Seoul Snow Depot',
   'Local pickup around Seoul or domestic shipping.', 'user', false),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'gangwon_gear', 'Gangwon Gear Room',
   'Gear rotation from a seasonal skier.', 'user', false),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'rink_buddy', 'Rink Buddy',
   'Used hockey gear from a local ice rink.', 'user', false)
on conflict (id) do update
set handle = excluded.handle,
    display_name = excluded.display_name,
    bio = excluded.bio,
    role = 'user',
    is_banned = false,
    updated_at = now();

insert into public.listings (
  id, seller_id, sport_id, category, title, description, price, currency,
  condition, status, details, location_text, published_at, created_at, updated_at
)
values
  ('10000000-0000-4000-8000-000000000001',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   'equipment', 'Salomon QST 98 176cm Ski Set',
   'All-mountain ski set with bindings. Edges and waxing were serviced recently.',
   480000, 'KRW', 'like_new', 'active',
   '{"brand":"Salomon","model":"QST 98","year":2024,"equipmentType":"skis","discipline":"freeride","lengthCm":176,"waistWidthMm":98,"bindingIncluded":true}'::jsonb,
   'Songpa, Seoul', now() - interval '1 day', now() - interval '1 day', now()),
  ('10000000-0000-4000-8000-000000000002',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111',
   'equipment', 'Rossignol Experience 88 Ti 172cm',
   'All-round carving ski with normal signs of use and no performance issues.',
   390000, 'KRW', 'good', 'active',
   '{"brand":"Rossignol","model":"Experience 88 Ti","year":2022,"equipmentType":"skis","discipline":"alpine","lengthCm":172,"waistWidthMm":88,"bindingIncluded":true}'::jsonb,
   'Chuncheon, Gangwon', now() - interval '2 days', now() - interval '2 days', now()),
  ('10000000-0000-4000-8000-000000000003',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111',
   'equipment', 'Atomic Hawx Prime 100 Ski Boots 265',
   'Intermediate ski boots, dried and stored after the last season.',
   220000, 'KRW', 'good', 'active',
   '{"brand":"Atomic","model":"Hawx Prime 100","year":2023,"equipmentType":"boots","bootSizeMondopoint":26.5,"bootFlex":100,"gender":"unisex"}'::jsonb,
   'Wonju, Gangwon', now() - interval '3 days', now() - interval '3 days', now()),
  ('10000000-0000-4000-8000-000000000004',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   'equipment', 'Black Crows Camox Freebird Touring Ski',
   'Light touring ski for backcountry beginners. Skins are not included.',
   650000, 'KRW', 'like_new', 'active',
   '{"brand":"Black Crows","model":"Camox Freebird","year":2024,"equipmentType":"skis","discipline":"touring","lengthCm":178,"waistWidthMm":95,"bindingIncluded":false}'::jsonb,
   'Mapo, Seoul', now() - interval '4 days', now() - interval '4 days', now()),
  ('10000000-0000-4000-8000-000000000005',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   'accessories', 'Smith Squad MAG Ski Goggles',
   'Includes two lenses. No major scratches on either lens.',
   120000, 'KRW', 'like_new', 'active',
   '{"brand":"Smith","model":"Squad MAG","year":2024,"equipmentType":"goggles","gender":"unisex","notes":"Day and photochromic lenses"}'::jsonb,
   'Yongsan, Seoul', now() - interval '5 days', now() - interval '5 days', now()),
  ('10000000-0000-4000-8000-000000000006',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111',
   'apparel', 'Descente Ski Jacket Mens M',
   'Warm black ski jacket worn only a few times this season.',
   180000, 'KRW', 'good', 'active',
   '{"brand":"Descente","model":"Ski Jacket","year":2023,"equipmentType":"jacket","size":"M","gender":"men"}'::jsonb,
   'Pyeongchang, Gangwon', now() - interval '6 days', now() - interval '6 days', now()),
  ('10000000-0000-4000-8000-000000000007',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111',
   'protective_gear', 'POC Obex MIPS Ski Helmet M',
   'MIPS helmet with no impact history. Inner pads were washed before storage.',
   160000, 'KRW', 'like_new', 'active',
   '{"brand":"POC","model":"Obex MIPS","year":2024,"equipmentType":"helmet","size":"M","gender":"unisex"}'::jsonb,
   'Gwangjin, Seoul', now() - interval '7 days', now() - interval '7 days', now()),
  ('10000000-0000-4000-8000-000000000008',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222',
   'equipment', 'CCM Jetspeed FT6 Pro Ice Skates 270',
   'Size 270 skates with one heat molding session and freshly serviced blades.',
   320000, 'KRW', 'like_new', 'active',
   '{"brand":"CCM","model":"Jetspeed FT6 Pro","year":2024,"equipmentType":"skates","format":"ice","skateSize":270,"skateWidth":"Regular"}'::jsonb,
   'Songpa, Seoul', now() - interval '1 day', now() - interval '1 day', now()),
  ('10000000-0000-4000-8000-000000000009',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222',
   'equipment', 'Bauer Vapor Hyperlite Hockey Stick 77 Flex',
   'Left-handed 77 flex stick. Replace the blade tape and it is ready to play.',
   180000, 'KRW', 'good', 'active',
   '{"brand":"Bauer","model":"Vapor Hyperlite","year":2023,"equipmentType":"stick","format":"ice","handedness":"left","stickFlex":77,"stickLengthCm":152,"curve":"P92","kickPoint":"low"}'::jsonb,
   'Gangdong, Seoul', now() - interval '2 days', now() - interval '2 days', now()),
  ('10000000-0000-4000-8000-000000000010',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222',
   'protective_gear', 'Warrior Alpha DX Hockey Gloves 14in',
   'Well-kept gloves with clean wrist protection and stitching.',
   90000, 'KRW', 'good', 'active',
   '{"brand":"Warrior","model":"Alpha DX","year":2022,"equipmentType":"gloves","format":"ice","size":"14","position":"any"}'::jsonb,
   'Seongnam, Gyeonggi', now() - interval '3 days', now() - interval '3 days', now()),
  ('10000000-0000-4000-8000-000000000011',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222',
   'protective_gear', 'Bauer Re-Akt 150 Hockey Helmet M',
   'Black M helmet with clean inner pads and no visible cracks.',
   130000, 'KRW', 'like_new', 'active',
   '{"brand":"Bauer","model":"Re-Akt 150","year":2024,"equipmentType":"helmet","format":"ice","size":"M","position":"any"}'::jsonb,
   'Seocho, Seoul', now() - interval '4 days', now() - interval '4 days', now()),
  ('10000000-0000-4000-8000-000000000012',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222',
   'protective_gear', 'CCM Tacks AS-V Shoulder Pads M',
   'M shoulder pads with firm chest and shoulder foam.',
   150000, 'KRW', 'good', 'active',
   '{"brand":"CCM","model":"Tacks AS-V","year":2023,"equipmentType":"shoulder_pads","format":"ice","size":"M","position":"defense"}'::jsonb,
   'Goyang, Gyeonggi', now() - interval '5 days', now() - interval '5 days', now()),
  ('10000000-0000-4000-8000-000000000013',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222',
   'apparel', 'Ice Hockey Practice Jersey L',
   'Clean L practice jersey with no name lettering.',
   60000, 'KRW', 'good', 'active',
   '{"brand":"CCM","model":"Practice Jersey","year":2023,"equipmentType":"jersey","format":"ice","size":"L","gender":"unisex"}'::jsonb,
   'Anyang, Gyeonggi', now() - interval '6 days', now() - interval '6 days', now()),
  ('10000000-0000-4000-8000-000000000014',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222',
   'accessories', 'CCM Hockey Bag 36in',
   '36-inch bag that fits skates and protective gear. All zippers work.',
   85000, 'KRW', 'fair', 'active',
   '{"brand":"CCM","model":"Stick Bag 36","year":2021,"equipmentType":"bag","format":"ice","size":"36 inch","gender":"unisex"}'::jsonb,
   'Jung-gu, Seoul', now() - interval '7 days', now() - interval '7 days', now())
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
    updated_at = now();

insert into public.listing_images (listing_id, storage_path, alt_text, sort_order)
select listing_id, image_url, title, 0
from (
  values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'https://placehold.co/1200x900/png?text=Salomon+QST+98', 'Salomon QST 98 ski set'),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'https://placehold.co/1200x900/png?text=Rossignol+Experience', 'Rossignol Experience ski'),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'https://placehold.co/1200x900/png?text=Atomic+Hawx+Boots', 'Atomic Hawx ski boots'),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'https://placehold.co/1200x900/png?text=Black+Crows+Touring', 'Black Crows touring ski'),
    ('10000000-0000-4000-8000-000000000005'::uuid, 'https://placehold.co/1200x900/png?text=Smith+Squad+MAG', 'Smith Squad MAG goggles'),
    ('10000000-0000-4000-8000-000000000006'::uuid, 'https://placehold.co/1200x900/png?text=Descente+Ski+Jacket', 'Descente ski jacket'),
    ('10000000-0000-4000-8000-000000000007'::uuid, 'https://placehold.co/1200x900/png?text=POC+Obex+Helmet', 'POC Obex helmet'),
    ('10000000-0000-4000-8000-000000000008'::uuid, 'https://placehold.co/1200x900/png?text=CCM+Jetspeed+Skates', 'CCM Jetspeed hockey skates'),
    ('10000000-0000-4000-8000-000000000009'::uuid, 'https://placehold.co/1200x900/png?text=Bauer+Hyperlite+Stick', 'Bauer Hyperlite hockey stick'),
    ('10000000-0000-4000-8000-000000000010'::uuid, 'https://placehold.co/1200x900/png?text=Warrior+Gloves', 'Warrior hockey gloves'),
    ('10000000-0000-4000-8000-000000000011'::uuid, 'https://placehold.co/1200x900/png?text=Bauer+Helmet', 'Bauer hockey helmet'),
    ('10000000-0000-4000-8000-000000000012'::uuid, 'https://placehold.co/1200x900/png?text=CCM+Shoulder+Pads', 'CCM shoulder pads'),
    ('10000000-0000-4000-8000-000000000013'::uuid, 'https://placehold.co/1200x900/png?text=Hockey+Jersey', 'Ice hockey jersey'),
    ('10000000-0000-4000-8000-000000000014'::uuid, 'https://placehold.co/1200x900/png?text=CCM+Hockey+Bag', 'CCM hockey bag')
) as demo(listing_id, image_url, title)
on conflict (listing_id, sort_order) do update
set storage_path = excluded.storage_path,
    alt_text = excluded.alt_text;

insert into public.community_posts (
  id, author_id, sport_id, title, body, status, published_at, created_at, updated_at
)
values
  ('30000000-0000-4000-8000-000000000001',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   '초보자 첫 스키, 길이 어떻게 고르세요?',
   '키 168cm인데 160cm 전후로 보면 될까요? 입문자에게 추천하는 모델과 렌탈 팁도 궁금합니다.',
   'active', now() - interval '1 day', now() - interval '1 day', now()),
  ('30000000-0000-4000-8000-000000000002',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222',
   '하키 스케이트 처음 사는 분들을 위한 체크리스트',
   '발볼, 열성형, 홀더 높이만 확인해도 실패 확률이 크게 줄어요. 직접 신어보고 체크할 포인트를 정리했습니다.',
   'active', now() - interval '3 days', now() - interval '3 days', now()),
  ('30000000-0000-4000-8000-000000000003',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111',
   '이번 주말 용평 같이 타실 분 있나요?',
   '토요일 오전에 용평에 갈 예정이에요. 초중급 슬로프 위주로 타고 점심을 함께할 메이트를 찾아요.',
   'active', now() - interval '5 days', now() - interval '5 days', now()),
  ('30000000-0000-4000-8000-000000000004',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222',
   '서울 동쪽 아이스링크 추천해주세요',
   '잠실과 광진 쪽에서 평일 저녁에 이용하기 좋은 링크가 있을까요? 대관이나 주차 정보도 공유 부탁드려요.',
   'active', now() - interval '7 days', now() - interval '7 days', now())
on conflict (id) do update
set author_id = excluded.author_id,
    sport_id = excluded.sport_id,
    title = excluded.title,
    body = excluded.body,
    status = excluded.status,
    published_at = excluded.published_at,
    updated_at = now();

commit;

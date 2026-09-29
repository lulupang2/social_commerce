-- Fictional catalog for the disposable preview ONLY; never a Supabase/production seed.
-- Run with psql --no-psqlrc -v ON_ERROR_STOP=1 as fixture_admin against
-- summergear_foundation_test. The database marker is checked before any writes.
-- Namespace 93000000: 1000 members, 2000 sellers, 3000 listings (2026-09-30).
-- Repeat runs preserve edits, sold stock, existing listings and review history.
-- Storage is not configured in this fixture; no fake image URLs are inserted.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'summergear_foundation_test'
    OR current_user <> 'fixture_admin'
    OR (SELECT target_id FROM summergear_meta.environment_guard WHERE singleton)
       IS DISTINCT FROM 'summergear-foundation-fixture-v1' THEN
    RAISE EXCEPTION 'disposable storefront fixture database required';
  END IF;
END $$;

INSERT INTO summergear_app.members(id, display_name, onboarded) VALUES
  ('93000000-1000-4000-8000-000000000001', '테스트 양양서프', true),
  ('93000000-1000-4000-8000-000000000002', '테스트 서울테니스', true),
  ('93000000-1000-4000-8000-000000000003', '카탈로그 fixture 검토자', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO summergear_app.sellers(id, type, display_name, status) VALUES
  ('93000000-2000-4000-8000-000000000001', 'individual', '테스트 양양서프', 'approved'),
  ('93000000-2000-4000-8000-000000000002', 'individual', '테스트 서울테니스', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO summergear_app.seller_memberships(seller_id, member_id, is_owner) VALUES
  ('93000000-2000-4000-8000-000000000001', '93000000-1000-4000-8000-000000000001', true),
  ('93000000-2000-4000-8000-000000000002', '93000000-1000-4000-8000-000000000002', true)
ON CONFLICT DO NOTHING;

-- The audit-only fixture actor has no login identity or live reviewer grant.
WITH catalog(n, sport, category, title, price, condition, location, description, details) AS (
  VALUES
  (1, 'surf', 'equipment', '입문용 소프트 서프보드 8ft', 190000, 'good', '강원 양양군',
   '테이크오프를 연습하기 좋은 소프트보드입니다. 바닥에 생활 흠집이 있으며 핀과 리시를 함께 드리는 구성입니다.',
   '{"sport":"surf","equipmentType":"surfboard","discipline":"longboard","boardLengthFeet":8,"volumeLiters":75,"finIncluded":true,"skillLevel":"beginner"}'::jsonb),
  (2, 'tennis', 'equipment', '컨트롤형 테니스 라켓 98 (305g, G2)', 165000, 'like_new', '서울 송파구',
   '중급자를 위한 컨트롤형 라켓입니다. 프레임 손상 없이 범퍼에 작은 쓸림만 있으며 기본 커버가 포함됩니다.',
   '{"sport":"tennis","equipmentType":"racket","headSizeSqIn":98,"weightGrams":305,"gripSize":"G2","stringPattern":"16x19","strung":true,"skillLevel":"intermediate"}'::jsonb),
  (3, 'surf', 'equipment', '에폭시 미드렝스 보드 7ft (48L)', 360000, 'good', '부산 해운대구 송정',
   '롱보드 다음 단계로 연습하기 좋은 미드렝스입니다. 데크 사용 흔적이 있고 레일 파손은 없는 테스트 매물입니다.',
   '{"sport":"surf","equipmentType":"surfboard","discipline":"funboard","boardLengthFeet":7,"volumeLiters":48,"finSystem":"futures","finIncluded":true}'::jsonb),
  (4, 'tennis', 'equipment', '가벼운 입문 라켓 100 (285g, G1)', 115000, 'good', '경기 성남시 분당구',
   '레슨 입문자가 다루기 편한 가벼운 라켓입니다. 오버그립 교체가 필요하며 스트링은 연습용으로 사용할 수 있습니다.',
   '{"sport":"tennis","equipmentType":"racket","headSizeSqIn":100,"weightGrams":285,"gripSize":"G1","stringPattern":"16x19","skillLevel":"beginner","strung":true}'::jsonb),
  (5, 'surf', 'apparel', '체스트집 웻슈트 3/2mm M', 125000, 'like_new', '제주 서귀포시',
   '봄과 가을 입수용 웻슈트입니다. 봉제선과 지퍼 상태가 양호하고 담수 세척 후 그늘에서 보관한 구성입니다.',
   '{"sport":"surf","equipmentType":"wetsuit","wetsuitThickness":"3_2mm","size":"M"}'::jsonb),
  (6, 'tennis', 'footwear', '올코트 테니스화 270mm', 72000, 'like_new', '서울 마포구',
   '하드코트용 테니스화입니다. 앞코에 작은 사용 흔적이 있고 아웃솔 마모가 적은 상태를 가정한 테스트 상품입니다.',
   '{"sport":"tennis","equipmentType":"shoes","size":"270mm"}'::jsonb),
  (7, 'surf', 'accessories', 'FCS II 미디엄 트라이핀 세트', 65000, 'good', '강원 강릉시',
   '미디엄 사이즈 트라이핀 3개 구성입니다. 핀 끝에 얕은 흠집이 있으며 전용 파우치를 포함하는 테스트 매물입니다.',
   '{"sport":"surf","equipmentType":"fins","finSystem":"fcs2","size":"M"}'::jsonb),
  (8, 'tennis', 'accessories', '라켓 6자루 수납 테니스 가방', 58000, 'good', '인천 연수구',
   '라켓과 운동복을 나누어 보관할 수 있는 가방입니다. 어깨끈과 지퍼 상태가 양호하며 바닥에 사용감이 있습니다.',
   '{"sport":"tennis","equipmentType":"bag","size":"6라켓"}'::jsonb),
  (9, 'surf', 'accessories', '서핑 리시코드 6ft 새 제품', 24000, 'new', '부산 수영구',
   '개봉하지 않은 여분 리시코드입니다. 숏보드용 6ft 길이이며 발목 커프와 스위블이 포함된 구성입니다.',
   '{"sport":"surf","equipmentType":"leash","size":"6ft"}'::jsonb),
  (10, 'tennis', 'apparel', '테니스 기능성 반팔 상의 L', 28000, 'like_new', '서울 강동구',
   '통기성이 좋은 기능성 반팔 상의입니다. 세탁 후 보관했으며 목 늘어남과 눈에 띄는 얼룩이 없는 테스트 매물입니다.',
   '{"sport":"tennis","equipmentType":"apparel","size":"L","gender":"unisex"}'::jsonb),
  (11, 'surf', 'accessories', '미드렝스 패딩 보드백 7ft', 85000, 'good', '강원 양양군',
   '차량 이동과 실내 보관에 사용하는 패딩 보드백입니다. 손잡이와 지퍼 정상이며 외부에 약간의 사용 흔적이 있습니다.',
   '{"sport":"surf","equipmentType":"boardbag","size":"7ft"}'::jsonb),
  (12, 'tennis', 'accessories', '테니스 오버그립 12개 묶음', 18000, 'new', '경기 수원시',
   '미사용 오버그립 12개 묶음입니다. 흰색과 검정색 혼합 구성이며 레슨용 여분을 준비하는 상황의 테스트 상품입니다.',
   '{"sport":"tennis","equipmentType":"strings_grips","size":"12개"}'::jsonb),
  (13, 'surf', 'equipment', '피쉬 서프보드 5ft 8in (34L)', 420000, 'good', '제주 제주시',
   '작은 파도에서 사용하는 피쉬 보드입니다. 데크에 눌림이 있고 리페어 이력은 없는 구성으로 핀은 별도입니다.',
   '{"sport":"surf","equipmentType":"surfboard","discipline":"fish","boardLengthCm":173,"volumeLiters":34,"finSystem":"futures","finIncluded":false,"skillLevel":"intermediate"}'::jsonb),
  (14, 'tennis', 'equipment', '연습용 테니스공 24개와 바구니', 32000, 'good', '서울 노원구',
   '서브와 볼머신 연습용 공 24개 구성입니다. 경기용 새 공이 아니며 이동용 접이식 바구니를 함께 제공합니다.',
   '{"sport":"tennis","equipmentType":"balls","size":"24개","playStyle":"recreational"}'::jsonb),
  (15, 'surf', 'footwear', '서핑 네오프렌 부츠 3mm 260mm', 45000, 'good', '울산 울주군',
   '차가운 물에서 발을 보호하는 네오프렌 부츠입니다. 밑창에 사용감이 있고 세척 후 건조한 상태의 테스트 상품입니다.',
   '{"sport":"surf","equipmentType":"other","size":"260mm","notes":"3mm 네오프렌 부츠"}'::jsonb),
  (16, 'tennis', 'equipment', '주니어 테니스 라켓 26인치', 55000, 'good', '경기 고양시',
   '어린이 레슨용 26인치 라켓입니다. 범퍼 사용감이 있으며 스트링과 기본 커버가 포함된 테스트 매물입니다.',
   '{"sport":"tennis","equipmentType":"racket","size":"26인치","gender":"youth","headSizeSqIn":100,"weightGrams":250,"skillLevel":"beginner","strung":true}'::jsonb)
), inserted AS (
  INSERT INTO summergear_app.listings
    (id, member_id, sport, category, title, description, price_krw, condition,
     status, details, location_text, published_at, created_at)
  SELECT ('93000000-3000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
    CASE WHEN sport='surf' THEN '93000000-1000-4000-8000-000000000001'::uuid
      ELSE '93000000-1000-4000-8000-000000000002'::uuid END,
    sport, category, '[테스트] ' || title,
    '화면·주문 흐름 확인용 가상 상품이며 실제 배송되지 않습니다. ' || description,
    price, condition, 'active', details, location,
    now() - n * interval '15 minutes', now() - n * interval '15 minutes'
  FROM catalog
  ON CONFLICT (id) DO NOTHING
  RETURNING id, sport
), stock AS (
  INSERT INTO summergear_app.inventory_items(listing_id, seller_id, available_quantity)
  SELECT id, CASE WHEN sport='surf' THEN '93000000-2000-4000-8000-000000000001'::uuid
    ELSE '93000000-2000-4000-8000-000000000002'::uuid END, 1
  FROM inserted
  RETURNING listing_id
)
INSERT INTO summergear_app.listing_review_events
  (listing_id, actor_member_id, from_status, to_status)
SELECT listing_id, '93000000-1000-4000-8000-000000000003', 'pending_review', 'active'
FROM stock;

COMMIT;

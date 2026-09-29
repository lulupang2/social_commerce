-- Fictional catalog for the disposable preview ONLY; never a Supabase/production seed.
-- Run with psql --no-psqlrc -v ON_ERROR_STOP=1 as fixture_admin against
-- summergear_foundation_test. The database marker is checked before any writes.
-- Namespace 93000000: 1000 members, 2000 sellers, 3000 listings (2026-09-30).
-- Repeat runs preserve edits, sold stock, existing listings and review history.
-- Opt in with -v refresh_copy=true to refresh only this catalog's active listing
-- titles/descriptions and fictional display names. Prices/stock/states stay intact.
-- Product illustrations are public web assets mapped to these exact fixture IDs;
-- Storage remains separate and no fake signed image URLs are inserted.
\set ON_ERROR_STOP on
\if :{?refresh_copy}
\else
\set refresh_copy false
\endif
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
  ('93000000-1000-4000-8000-000000000001', '양양 주말서퍼', true),
  ('93000000-1000-4000-8000-000000000002', '퇴근후 테니스', true),
  ('93000000-1000-4000-8000-000000000003', '카탈로그 fixture 검토자', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO summergear_app.sellers(id, type, display_name, status) VALUES
  ('93000000-2000-4000-8000-000000000001', 'individual', '양양 주말서퍼', 'approved'),
  ('93000000-2000-4000-8000-000000000002', 'individual', '퇴근후 테니스', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO summergear_app.seller_memberships(seller_id, member_id, is_owner) VALUES
  ('93000000-2000-4000-8000-000000000001', '93000000-1000-4000-8000-000000000001', true),
  ('93000000-2000-4000-8000-000000000002', '93000000-1000-4000-8000-000000000002', true)
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE storefront_catalog ON COMMIT DROP AS
SELECT * FROM (
  VALUES
  (1, 'surf', 'equipment', '8ft 소프트보드 민트 · 핀과 리시 포함', 190000, 'good', '강원 양양군',
   '올여름 입문용으로 구매해 주말에 6번 정도 사용했습니다. 부력이 넉넉해서 패들링과 테이크오프 연습하기 편해요. 바닥에 생활 흠집은 있지만 찢어지거나 물이 들어간 곳은 없습니다. 기본 핀과 검정 리시 함께 드립니다. 크기가 있어 죽도해변 근처 직거래를 선호합니다.',
   '{"sport":"surf","equipmentType":"surfboard","discipline":"longboard","boardLengthFeet":8,"volumeLiters":75,"finIncluded":true,"skillLevel":"beginner"}'::jsonb),
  (2, 'tennis', 'equipment', '컨트롤 라켓 98 · 305g / G2 / 커버 포함', 165000, 'like_new', '서울 송파구',
   '라켓 무게를 낮추면서 정리합니다. 98 헤드에 305g, 2그립이고 주 1회 레슨으로 두 달 사용했어요. 범퍼에 미세한 쓸림 외에 크랙이나 큰 찍힘은 없습니다. 흰색 오버그립과 기본 커버 포함입니다. 잠실 직거래 가능하고 택배는 완충 포장해서 보내드립니다.',
   '{"sport":"tennis","equipmentType":"racket","headSizeSqIn":98,"weightGrams":305,"gripSize":"G2","stringPattern":"16x19","strung":true,"skillLevel":"intermediate"}'::jsonb),
  (3, 'surf', 'equipment', '7ft 에폭시 미드렝스 48L · 블루 스트라이프', 360000, 'good', '부산 해운대구 송정',
   '롱보드 다음 단계에서 사용하던 7ft 미드렝스입니다. 데크에 발자국 눌림이 조금 있지만 레일과 노즈는 깨끗하고 리페어 이력 없습니다. 입수 후 항상 담수로 씻어 실내 보관했어요. 핀 포함 가격이며 송정에서 보드 상태 직접 보고 거래하시면 좋겠습니다.',
   '{"sport":"surf","equipmentType":"surfboard","discipline":"funboard","boardLengthFeet":7,"volumeLiters":48,"finSystem":"futures","finIncluded":true}'::jsonb),
  (4, 'tennis', 'equipment', '민트 입문 라켓 100 · 285g / G1', 115000, 'good', '경기 성남시 분당구',
   '첫 레슨 시작할 때 쓰던 285g 라켓입니다. 헤드가 넓고 가벼워서 입문자나 손목 부담을 줄이고 싶은 분께 잘 맞아요. 범퍼에는 사용 흔적이 있고 프레임 크랙은 없습니다. 오버그립은 교체를 권장합니다. 분당 직거래 또는 택배 가능합니다.',
   '{"sport":"tennis","equipmentType":"racket","headSizeSqIn":100,"weightGrams":285,"gripSize":"G1","stringPattern":"16x19","skillLevel":"beginner","strung":true}'::jsonb),
  (5, 'surf', 'apparel', '체스트집 웻슈트 3/2mm M', 125000, 'like_new', '제주 서귀포시',
   '지난 봄 구매한 M 사이즈 체스트집 풀슈트입니다. 총 4회 착용했고 매번 담수 세척 후 그늘 건조했습니다. 겨드랑이와 무릎 봉제선 벌어짐 없고 지퍼도 잘 움직입니다. 3/2mm 두께로 봄가을용으로 입었어요. 중문 근처에서 확인 후 거래 가능합니다.',
   '{"sport":"surf","equipmentType":"wetsuit","wetsuitThickness":"3_2mm","size":"M"}'::jsonb),
  (6, 'tennis', 'footwear', '화이트·네이비 올코트 테니스화 270', 72000, 'like_new', '서울 마포구',
   '사이즈가 조금 커서 실내 하드코트에서 두 번 신고 보관했습니다. 앞코에 옅은 쓸림만 있고 밑창 패턴은 선명하게 남아 있어요. 세척 완료했으며 여분 끈이나 박스는 없습니다. 마포구 직거래 가능하고 택배비는 별도입니다.',
   '{"sport":"tennis","equipmentType":"shoes","size":"270mm"}'::jsonb),
  (7, 'surf', 'accessories', '미디엄 트라이핀 3개 세트 · 파우치 포함', 65000, 'good', '강원 강릉시',
   '보드를 바꾸면서 사용하던 트라이핀 세트 내놓습니다. 센터핀 하나와 사이드핀 두 개, 검정 파우치 구성입니다. 핀 끝에 얕은 스크래치는 있지만 갈라진 부분은 없습니다. 구매 전 보드 핀박스 호환을 확인해 주세요. 강릉 직거래와 택배 모두 가능합니다.',
   '{"sport":"surf","equipmentType":"fins","finSystem":"fcs2","size":"M"}'::jsonb),
  (8, 'tennis', 'accessories', '6라켓 테니스 가방 · 네이비/세이지', 58000, 'good', '인천 연수구',
   '동호회 다니며 사용한 6라켓 가방입니다. 라켓과 운동복을 나눠 넣을 수 있고 양쪽 어깨끈 패딩도 잘 살아 있습니다. 바닥 사용감은 있지만 찢어짐 없고 지퍼 전부 정상이에요. 내부 비우고 닦아 두었습니다. 송도 직거래 가능합니다.',
   '{"sport":"tennis","equipmentType":"bag","size":"6라켓"}'::jsonb),
  (9, 'surf', 'accessories', '서핑 리시코드 6ft 새 제품', 24000, 'new', '부산 수영구',
   '여분으로 사두고 입수에는 사용하지 않은 검정 6ft 리시입니다. 발목 커프, 양쪽 스위블, 레일세이버가 모두 붙어 있는 구성이고 보관하면서 포장만 제거했습니다. 숏보드용 길이입니다. 광안리 근처 직거래 또는 택배 가능합니다.',
   '{"sport":"surf","equipmentType":"leash","size":"6ft"}'::jsonb),
  (10, 'tennis', 'apparel', '세이지 기능성 테니스 반팔 L', 28000, 'like_new', '서울 강동구',
   '차분한 세이지 색상의 기능성 반팔입니다. L 사이즈이고 운동할 때 두 번 착용했습니다. 얇고 통기성이 좋으며 목 늘어남, 보풀, 얼룩은 없습니다. 세탁 후 보관 중이에요. 강동구 직거래나 반값택배 가능합니다.',
   '{"sport":"tennis","equipmentType":"apparel","size":"L","gender":"unisex"}'::jsonb),
  (11, 'surf', 'accessories', '미드렝스 패딩 보드백 7ft', 85000, 'good', '강원 양양군',
   '7ft 미드렝스를 넣어 차량 이동할 때 사용한 패딩 보드백입니다. 실버 원단에 노즈와 테일 보강이 있고 손잡이, 어깨끈, 지퍼 모두 정상입니다. 바깥쪽 생활 얼룩과 접힌 자국은 있지만 안감 찢어짐은 없어요. 양양에서 직거래 가능합니다.',
   '{"sport":"surf","equipmentType":"boardbag","size":"7ft"}'::jsonb),
  (12, 'tennis', 'accessories', '테니스 오버그립 12개 묶음', 18000, 'new', '경기 수원시',
   '미사용 오버그립을 흰색 6개, 검정색 6개 총 12개로 묶어서 판매합니다. 모두 사용하지 않고 말아 보관한 상태입니다. 라켓을 자주 쓰는 분이 여분으로 두기 좋아요. 낱개 판매는 어렵고 수원 직거래 또는 택배 가능합니다.',
   '{"sport":"tennis","equipmentType":"strings_grips","size":"12개"}'::jsonb),
  (13, 'surf', 'equipment', '피쉬보드 5ft 8in · 34L / 옐로', 420000, 'good', '제주 제주시',
   '작은 여름 파도에서 재미있게 탔던 34L 피쉬보드입니다. 옅은 옐로 데크에 스왈로 테일 형태이고 데크 눌림은 있지만 딩이나 리페어 이력은 없습니다. 핀은 제외한 보드 단품 가격입니다. 제주시에서 직접 상태 확인 후 거래하고 싶습니다.',
   '{"sport":"surf","equipmentType":"surfboard","discipline":"fish","boardLengthCm":173,"volumeLiters":34,"finSystem":"futures","finIncluded":false,"skillLevel":"intermediate"}'::jsonb),
  (14, 'tennis', 'equipment', '연습용 테니스공 24개와 바구니', 32000, 'good', '서울 노원구',
   '개인 서브 연습에 쓰던 테니스공 24개와 철제 바구니 일괄입니다. 공은 펠트 사용감이 있고 새 공보다 압력이 낮아 연습용으로 권장합니다. 바구니 손잡이는 정상이고 이동하기 편합니다. 노원구 직거래를 선호합니다.',
   '{"sport":"tennis","equipmentType":"balls","size":"24개","playStyle":"recreational"}'::jsonb),
  (15, 'surf', 'footwear', '서핑 네오프렌 부츠 3mm 260mm', 45000, 'good', '울산 울주군',
   '3mm 네오프렌 서핑 부츠 260mm입니다. 작년 가을 세 번 착용했으며 밑창 사용감은 조금 있지만 고무가 벗겨지거나 봉제선이 벌어진 곳은 없습니다. 담수 세척하고 완전히 말려 보관했습니다. 울주군 직거래 또는 택배 가능합니다.',
   '{"sport":"surf","equipmentType":"other","size":"260mm","notes":"3mm 네오프렌 부츠"}'::jsonb),
  (16, 'tennis', 'equipment', '주니어 테니스 라켓 26인치', 55000, 'good', '경기 고양시',
   '아이가 성인 라켓으로 바꾸면서 정리하는 26인치 주니어 라켓입니다. 코럴·네이비 프레임이고 레슨 때만 사용했습니다. 범퍼에 작은 쓸림은 있지만 휘거나 깨진 부분은 없습니다. 스트링과 기본 커버 포함이며 고양시 직거래 가능합니다.',
   '{"sport":"tennis","equipmentType":"racket","size":"26인치","gender":"youth","headSizeSqIn":100,"weightGrams":250,"skillLevel":"beginner","strung":true}'::jsonb)
) AS catalog(n, sport, category, title, price, condition, location, description, details);

-- The audit-only fixture actor has no login identity or live reviewer grant.
WITH inserted AS (
  INSERT INTO summergear_app.listings
    (id, member_id, sport, category, title, description, price_krw, condition,
     status, details, location_text, published_at, created_at)
  SELECT ('93000000-3000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
    CASE WHEN sport='surf' THEN '93000000-1000-4000-8000-000000000001'::uuid
      ELSE '93000000-1000-4000-8000-000000000002'::uuid END,
    sport, category, title,
    description || E'\n\n서비스 체험용 가상 상품입니다. 예시 사진이며 실제 배송되지 않습니다.',
    price, condition, 'active', details, location,
    now() - n * interval '15 minutes', now() - n * interval '15 minutes'
  FROM storefront_catalog
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

-- Only explicit copy refreshes update existing active fixtures; never restock.
UPDATE summergear_app.listings l
SET title=c.title,
    description=c.description || E'\n\n서비스 체험용 가상 상품입니다. 예시 사진이며 실제 배송되지 않습니다.'
FROM storefront_catalog c
WHERE :'refresh_copy'::boolean
  AND l.id=('93000000-3000-4000-8000-' || lpad(c.n::text,12,'0'))::uuid
  AND l.member_id=CASE WHEN c.sport='surf' THEN '93000000-1000-4000-8000-000000000001'::uuid
    ELSE '93000000-1000-4000-8000-000000000002'::uuid END
  AND l.status='active'
  AND (l.title,l.description) IS DISTINCT FROM
    (c.title,c.description || E'\n\n서비스 체험용 가상 상품입니다. 예시 사진이며 실제 배송되지 않습니다.');

UPDATE summergear_app.members SET display_name=CASE id
  WHEN '93000000-1000-4000-8000-000000000001' THEN '양양 주말서퍼' ELSE '퇴근후 테니스' END
WHERE :'refresh_copy'::boolean AND id IN
  ('93000000-1000-4000-8000-000000000001','93000000-1000-4000-8000-000000000002')
  AND display_name IN ('테스트 양양서프','테스트 서울테니스');

UPDATE summergear_app.sellers SET display_name=CASE id
  WHEN '93000000-2000-4000-8000-000000000001' THEN '양양 주말서퍼' ELSE '퇴근후 테니스' END
WHERE :'refresh_copy'::boolean AND id IN
  ('93000000-2000-4000-8000-000000000001','93000000-2000-4000-8000-000000000002')
  AND display_name IN ('테스트 양양서프','테스트 서울테니스');

COMMIT;

# IceGear MVP 데이터 모델

**상태:** 개념적 관계 모델과 현재 Supabase migration을 함께 설명합니다. 실제 적용 스키마는
`supabase/migrations/0001_init.sql`을 기준으로 하며, 아래의 조건부/향후 엔터티가 모두 MVP에 포함된다는 뜻은 아닙니다.

현재 `packages/domain` 계약은 저장소의 가장 강한 구현 근거입니다. ski/hockey sport, 판매자 소유 listing,
seller와 transaction, community post/comment/reaction, report, profile/onboarding을 모델링합니다.
아래 모델은 이 계약을 Supabase/Postgres의 출발점으로 정리한 것이며 모든 lifecycle의 출시를 약속하지 않습니다.

## 모델링 규칙

- 검토된 요구사항이 없으면 공개 식별자는 UUID를 사용합니다.
- timestamp는 UTC `timestamptz`로 저장하고 API에서는 ISO-8601로 노출합니다.
- `auth.users`를 identity source로 유지하고 애플리케이션 테이블은 UUID만 참조하며 비밀번호를 저장하지 않습니다.
- 명시적인 status와 database constraint로 상태 전이를 제한합니다.
- 제품이 더 많은 sport를 승인하기 전까지 `ski`, `hockey`만 허용합니다.
- 사용자가 입력한 listing 상세는 검증된 형태로 저장합니다. 초기에는 스포츠 전용 필드에 JSONB를 사용할 수 있습니다.
- 문서화된 query path에 필요한 index만 추가하고, 검색 인프라는 측정 후 도입합니다.
- 첫 query가 서버에서만 실행되더라도 모든 애플리케이션 테이블에 RLS를 활성화합니다.

## Identity와 profile 엔터티

### `profiles`

Supabase Auth subject마다 하나의 애플리케이션 profile을 둡니다. 현재 domain 계약은 profile 입력에 display name,
onboarding에 하나 이상의 선호 sport를 요구합니다. 실제 migration의 profile 컬럼은 현재 MVP에 필요한 최소 형태로 시작하며,
추가 onboarding 필드는 후속 migration에서 결정합니다.

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | `uuid` | PK; Auth subject와 같은 profile ID |
| `user_id` | `uuid` | 개념 모델상 `auth.users.id` unique FK; 실제 migration에서는 `id`가 FK 역할을 수행 |
| `username` | `text` | 선택; 활성화 시 소문자/형식 제한 |
| `display_name` | `text` | 필수; 길이 제한 |
| `bio` | `text` | 선택; 길이 제한 |
| `avatar_path` | `text` | profile media 승인 시에만 선택 |
| `location` | `jsonb` | 선택; 정밀도/PII 최소화와 형태 검증 |
| `preferred_sports` | `text[]` | onboarding에서 승인된 sport 하나 이상 요구 |
| `skill_level` | `text` | 선택; beginner/intermediate/advanced/expert |
| `created_at` | `timestamptz` | 서버 기본값 |
| `updated_at` | `timestamptz` | 서버가 관리 |

RLS: 사용자는 자신의 profile만 읽고 수정할 수 있습니다. 공개 profile 여부는 미결정이며 기본적으로 차단합니다.
가입 후 trigger 또는 서버 작업이 행을 만들 수 있지만 lifecycle은 반드시 선택하고 테스트해야 합니다.

### `seller_profiles` (조건부 확장)

domain 계약은 `individual`, `shop`, `brand` seller type을 모델링합니다. migration 전에 seller 정보를 profile의 확장으로
둘지 별도 테이블로 둘지 결정합니다.

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | `uuid` | PK; listing이 참조하는 seller identity |
| `profile_id` | `uuid` | 한 사용자가 하나의 seller 계정을 소유한다면 unique FK |
| `account_type` | `text` | seller type 제한 |
| `verified` | `boolean` | 서버/operator만 관리; 정책 없이 신뢰 보증으로 노출하지 않음 |
| `created_at` | `timestamptz` | 서버 기본값 |

seller 검증, 여러 seller 계정, 법적 identity, payout, seller self-service onboarding은 미결정입니다.
요구사항이 생기기 전에는 법률/결제 데이터를 저장하지 않습니다.

## Marketplace/listing 엔터티

### `listings`

ski 또는 hockey 장비에 대한 판매자 소유 record입니다. 현재 domain 계약의 주 marketplace 엔터티이며,
향후 독립적인 canonical catalog item과는 구분합니다.

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `seller_id` | `uuid` | 선택한 seller/profile identity FK |
| `sport` | `text` | 현재 계약에서는 `ski` 또는 `hockey` |
| `category` | `text` | equipment, apparel, protective_gear, accessories, parts, other |
| `status` | `text` | draft, pending_review, active, reserved, sold, archived, removed |
| `condition` | `text` | new, like_new, good, fair, poor |
| `title` | `text` | 필수, 길이 제한 |
| `description` | `text` | 필수, 길이 제한; rich text 허용 시 sanitize |
| `price_amount` | `numeric` | 0 이상; precision/scale 결정 필요 |
| `currency` | `char(3)` | 대문자 ISO code; USD/CAD/EUR/GBP/JPY/KRW 예시 |
| `location` | `jsonb` | 선택; 정밀 위치 최소화 |
| `tags` | `text[]` | 선택; 개수/길이 제한 |
| `sport_details` | `jsonb` | sport discriminator domain schema로 검증 |
| `is_negotiable` | `boolean` | 선택; marketplace 정책 결정 필요 |
| `shipping_available` | `boolean` | 선택; fulfillment 약속 아님 |
| `local_pickup_available` | `boolean` | 선택; 안전/위치 정책 필요 |
| `created_at` | `timestamptz` | 서버 기본값 |
| `updated_at` | `timestamptz` | 서버가 관리 |

현재 sport 상세에는 ski discipline/equipment/measurement와 hockey format/equipment/position/handedness/measurement가 있습니다.
공유 검증 뒤에 저장하고, Zod schema가 forward-compatible하다는 이유만으로 임의 key를 신뢰하지 않습니다.

RLS: seller는 자신의 draft/review-pending listing만 생성/수정/삭제할 수 있습니다. 공개 조회자는 active와 승인된 필드만 봅니다.
operator는 검토된 상태 전이를 수행합니다. `reserved`, `sold`, `archived`, `removed` 의미는 production 전에 정책을 확정합니다.

### `listing_media` (조건부)

MVP에서 image를 사용할 때 listing에 연결하는 media metadata입니다.

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `listing_id` | `uuid` | `listings` FK |
| `storage_path` | `text` | 서버가 생성; client path를 신뢰하지 않음 |
| `alt_text` | `text` | 공개 media에는 필수 |
| `sort_order` | `integer` | 0 이상 |
| `created_at` | `timestamptz` | 서버 기본값 |

Storage bucket은 기본 비공개로 유지합니다. 서버 작업이 active listing media에만 signed URL 또는 검토된 public URL을 반환할 수 있습니다.
이미지 형식, 변환, 용량, 저작권은 미결정입니다.

### `catalog_items` (향후; 임의로 추가하지 않음)

여러 판매자의 중복을 줄이는 독립적인 canonical gear record가 될 수 있지만 현재 domain package에는 없습니다.
IceGear가 peer marketplace인지 catalog/affiliate 서비스인지 결정하기 전에는 placeholder로 추가하지 않습니다.

## Transaction 엔터티 (보류)

### `transactions`

domain 계약에는 buyer, seller, listing, amount, payment method, fulfillment status, shipping address, timestamp가 있지만,
이는 계획 계약일 뿐 checkout이나 payment 구현을 승인하는 것은 아닙니다.

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `listing_id` | `uuid` | `listings` FK |
| `buyer_id` | `uuid` | profile/Auth subject FK |
| `seller_id` | `uuid` | seller identity FK; listing owner와 일치 |
| `amount` | `numeric` | 생성 후 합의 금액 불변 |
| `currency` | `char(3)` | 명시 필수; 암묵적 환산 금지 |
| `status` | `text` | pending, accepted, payment_pending, paid, fulfilling, shipped, completed, cancelled, disputed, refunded |
| `fulfillment_status` | `text` | not_started, pickup_scheduled, ready_for_pickup, shipped, delivered, complete |
| `payment_method` | `text` | card, cash, bank_transfer, other; provider/security 검토 필요 |
| `shipping_address` | `jsonb` | 민감 PII; shipping/legal 요구 전 보류 |
| `created_at` / `updated_at` | `timestamptz` | 서버가 관리 |
| `completed_at` | `timestamptz` | 선택; 상태 전이로 관리 |

seller model, payment provider, 지역/통화, 세금, fulfillment, refund, webhook 규칙을 정하기 전에는 이 테이블을 migration하지 않습니다.
선결제 없는 reservation을 승인한다면 settled payment와 별도 entity로 모델링하고 의미를 명시합니다.

## Community와 moderation 엔터티 (조건부 MVP)

### `community_posts`

사용자가 작성하는 콘텐츠입니다. 현재 domain 값은 discussion, question, guide, review, event, announcement입니다.

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `author_id` | `uuid` | profile/Auth subject FK |
| `sport` | `text` | 승인된 sport 선택 |
| `type` | `text` | post type 제한 |
| `title` | `text` | 제품 결정에 따른 필수/길이 제한 |
| `body` | `text` | 필수/길이 제한 및 sanitize |
| `tags` | `text[]` | 선택, 개수 제한 |
| `status` | `text` | moderation 상태; 정확한 값은 미결정 |
| `created_at` / `updated_at` | `timestamptz` | 서버가 관리 |

### `community_comments`

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `post_id` | `uuid` | `community_posts` FK |
| `author_id` | `uuid` | profile/Auth subject FK |
| `body` | `text` | 필수/길이 제한 및 sanitize |
| `status` | `text` | moderation 상태; 정확한 값은 미결정 |
| `created_at` / `updated_at` | `timestamptz` | 서버가 관리 |

### `community_reactions`

현재 계약은 `like`, `helpful`, `celebrate` reaction을 허용합니다. 한 사용자가 post당 하나를 가지는지 kind별 하나를 가지는지
결정한 뒤 primary/unique key를 정의합니다.

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `post_id` | `uuid` | `community_posts` FK |
| `user_id` | `uuid` | `auth.users` FK |
| `kind` | `text` | reaction kind 제한 |
| `created_at` | `timestamptz` | 서버 기본값 |

### `reports`

현재 계약은 listing, profile, post, comment, message 대상과 spam, scam, counterfeit, prohibited_item, harassment,
hate_speech, unsafe_meetup, copyright, other 사유를 지원합니다. `message`는 messaging과 함께 보류합니다.

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `reporter_id` | `uuid` | Auth subject FK |
| `target_type` | `text` | 대상 타입 제한; 미구현 대상은 제외 |
| `target_id` | `uuid` | 불투명 대상 참조 |
| `reason` | `text` | 사유 제한 |
| `details` | `text` | 선택, 길이 제한; 민감 정보가 포함될 수 있음 |
| `status` | `text` | pending, open, under_review, resolved, dismissed |
| `created_at` / `resolved_at` | `timestamptz` | 서버가 관리 |
| `resolution_note` | `text` | operator 전용; 보존 정책 필요 |

Community를 공개하기 전에는 report rate limit, abuse control, moderator role, 대상 공개 범위, 보존/삭제 정책이 필요합니다.

## 향후 사용자 관계

`saves`, follow, collection은 흔한 social-commerce 관계지만 현재 domain package에는 없습니다.
제품이 확정한 뒤에만 추가합니다. save가 출시되면 `(user_id, listing_id)` unique key와 owner-only RLS를 사용하며,
구매를 save로 표현하지 않습니다.

## 관계

```text
auth.users 1 ---- 0..1 profiles
profiles 1 ------ 0..1 seller_profiles (조건부)
seller_profiles 1 ---- * listings
profiles 1 ------ * community_posts
community_posts 1 ---- * community_comments
profiles * ------ * community_posts through community_reactions
profiles 1 ------ * reports
listings 1 ------ * listing_media (조건부)
listings 1 ------ * transactions (보류)
```

## Constraint와 index

후보 profile/listing/community 모델의 최소 constraint:

- `profiles.user_id`는 unique이며 검토된 delete 동작으로 `auth.users(id)`를 참조합니다.
- `listings.sport`, `category`, `status`, `condition`은 임의 client text가 아닌 제한된 값입니다.
- `listings.price_amount >= 0`, currency는 세 글자 대문자 code이며 numeric precision/scale을 migration 전에 결정합니다.
- `listings.seller_id`는 승인된 seller identity를 참조해야 합니다.
- `listing_media.sort_order`는 0 이상으로 제한합니다.
- Community title/body는 서버 길이 제한과 sanitize 정책을 갖습니다.
- Reaction uniqueness는 제품 규칙에 따라 database에서 강제합니다.
- `updated_at`은 trigger 또는 신뢰된 write path에서 일관되게 유지합니다.

후보 index:

- `listings(status, sport, updated_at desc)` 공개 조회
- `listings(seller_id, created_at desc)` 판매자 listing
- `listings(category, condition)` 첫 release filter일 때만
- `listing_media(listing_id, sort_order)` media 활성화 시
- `community_posts(status, created_at desc)` moderation feed
- `community_comments(post_id, created_at)` post 상세
- `reports(status, created_at)` operator triage
- transaction 승인 후에만 `transactions(buyer_id, created_at desc)`, `(seller_id, created_at desc)`

taxonomy/search 요구사항이 확정되기 전에는 가능한 filter마다 index를 만들지 않습니다.

## RLS 정책 매트릭스

아래 정책 이름은 설명용입니다. 실제 SQL과 함께 검토해야 합니다.

| 테이블 | anonymous | 인증된 owner/user | operator/moderator |
| --- | --- | --- | --- |
| `profiles` | 기본적으로 접근 불가 | 자신의 행만 | 필요할 때 명시적 support 접근 |
| `seller_profiles` | 승인된 public summary만 | 자신의 seller 행 | 명시적 verification 작업 |
| `listings` | active public 필드만 | 자신의 draft/review listing; active public read | 생성/수정/검토 전이 |
| `listing_media` | 승인된 active media만 | 자신의 draft media | listing/operator 정책에 따라 관리 |
| `transactions` | 접근 불가 | 승인된 transaction flow의 buyer/seller 행 | 감사되는 support 접근 |
| `community_posts/comments` | 승인된 public content만 | 자신의 write; 승인된 public read | moderation 작업 |
| `community_reactions` | 승인된 집계/public subset | 자신의 reaction | 기본적으로 넓은 접근 금지 |
| `reports` | 접근 불가 | 정책이 허용하는 범위의 생성/조회 | moderator triage/resolve |

Supabase table policy가 안전한 응답 shaping을 대신하지는 않습니다. 한 행에 공개 필드와 운영 필드가 함께 있다면
view 또는 서버 projection을 사용합니다. client가 `seller_id`, `author_id`, `reporter_id`, operator field를 권한 신호로 설정하게 두지 않습니다.

## 삭제와 보존

계정 hard delete, 익명화, 감사 보존 여부는 아직 결정하지 않았습니다.

- 불필요한 PII, 특히 shipping address와 정밀 위치를 저장하지 않습니다.
- listing과 moderation 결과는 기본적으로 물리 삭제 대신 archive/remove 상태를 사용합니다.
- profile 삭제 전 foreign-key 동작을 검토합니다.
- privacy 요구가 생기면 ADR에 data retention 가정을 기록합니다.

## Migration 규율

모든 스키마 변경은 순서가 있는 검토된 SQL migration이어야 합니다. migration에는 constraint, index, RLS 활성화,
정책, anonymous/owner/operator 테스트 계획이 함께 있어야 합니다. 생성 TypeScript 타입을 사용한다면 대상 스키마에서
재생성하고 커밋하거나 CI에서 재현 가능하게 만듭니다. domain schema와 database constraint는 의도적으로 맞추며,
어느 한쪽도 authorization 범위를 조용히 넓히지 않습니다.

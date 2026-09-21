# SummerGear MVP 데이터 모델

> 범위: 기존 MVP 데이터와 Go 전환 중 추가된 private 스키마를 함께 설명합니다. 내부 회원·인증 테이블은 `0008_go_auth.sql`, 첫 Go 소유 매물은 `0009_go_listings.sql`에 추가되며 기존 `public.*` 구조는 파괴하지 않습니다. 입점사·주문·정산의 예정 모델은 [인증 설계](authentication.md)와 [입점사와 거래 설계](commerce.md)에 있습니다.

**상태:** 기존 하계 스포츠 스키마를 유지하면서 `summergear_app.members`·서비스 세션과 `summergear_app.listings` 전환 스키마를 격리 fixture에 적용·검증했습니다. Hosted Supabase 실적용은 별도입니다.

---

## 1. 스포츠 기준 데이터 (`sports`)

| 컬럼                        | 타입          | 설명                                              |
| --------------------------- | ------------- | ------------------------------------------------- |
| `id`                        | `uuid`        | PK (서핑: `11111111-...`, 테니스: `22222222-...`) |
| `slug`                      | `text`        | 고유 슬러그 (`surf`, `tennis`)                    |
| `name`                      | `text`        | 스포츠 한글명 (`서핑`, `테니스`)                  |
| `description`               | `text`        | 스포츠 설명                                       |
| `is_active`                 | `boolean`     | 활성화 여부                                       |
| `created_at` / `updated_at` | `timestamptz` | 생성 및 수정 시각                                 |

---

## 2. Go 전환 매물 (`summergear_app.listings`)

이 테이블은 서비스 세션으로 확인한 내부 `members(id)`를 소유자로 사용하는 첫 Go 소유 업무 테이블입니다. 기존 `public.listings`를 즉시 바꾸지 않고 추가한 뒤 호출·데이터·이미지를 단계적으로 이관합니다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `member_id` | `uuid` | `summergear_app.members(id)` FK, Go 서비스 세션 소유자 |
| `sport` | `text` | `surf`, `tennis` |
| `category` | `text` | 기존 매물 카테고리와 동일한 허용값 |
| `title` / `description` | `text` | 서버 길이 검증과 DB check 적용 |
| `price_krw` | `bigint` | 현재 전환 API에서 정수 KRW만 허용 |
| `condition` | `text` | `new`, `like_new`, `good`, `fair`, `poor` |
| `status` | `text` | 생성 시 `pending_review`; 공개는 `active` + `published_at` 필요 |
| `details` | `jsonb` | `details->>'sport' = sport`, 8 KiB 상한과 Go 도메인 검증 |
| `location_text` | `text` | 거래 희망 지역 |
| `published_at` | `timestamptz` | 공개 시각 |
| `created_at` / `updated_at` | `timestamptz` | 생성·수정 시각 |

RLS는 공개 요청에 `active` 행만 보이고, 인증 요청은 Go가 트랜잭션 로컬 `summergear.member_id`에 넣은 회원 ID와 `member_id`가 같은 비공개 행만 추가로 볼 수 있게 합니다. API 역할은 생성과 제한된 필드 수정만 가능하고 worker·브라우저 역할은 이 private 테이블에 직접 접근하지 않습니다. 이미지 메타데이터·Storage는 아직 이 테이블로 이전하지 않았습니다.

---

## 3. 기존 장비 거래 엔터티 (`public.listings`)

| 컬럼            | 타입               | 설명                                                                                       |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `id`            | `uuid`             | PK                                                                                         |
| `seller_id`     | `uuid`             | 판매자 `profiles(id)` FK                                                                   |
| `sport_id`      | `uuid`             | `sports(id)` FK                                                                            |
| `category`      | `listing_category` | `equipment`, `apparel`, `footwear`, `protective`, `accessories`, `other`                   |
| `title`         | `text`             | 매물 제목                                                                                  |
| `description`   | `text`             | 상세 설명                                                                                  |
| `price`         | `numeric`          | 판매 가격 (KRW / USD 등)                                                                   |
| `currency`      | `char(3)`          | 통화 코드 (기본 `KRW`)                                                                     |
| `condition`     | `text`             | `new`, `like_new`, `good`, `fair`, `poor`                                                  |
| `status`        | `listing_status`   | `draft`, `pending_review`, `rejected`, `active`, `reserved`, `sold`, `archived`, `removed` |
| `details`       | `jsonb`            | 서핑 또는 테니스 정밀 도메인 스펙 (아래 참조)                                              |
| `location_text` | `text`             | 거래 희망 지역 (예: '강원 양양군', '서울 강남구')                                          |
| `published_at`  | `timestamptz`      | 공개 승인 시각                                                                             |

### `details` JSONB 스키마

#### 서핑 (`sport: "surf"`)

```json
{
  "sport": "surf",
  "brand": "Channel Islands",
  "model": "Happy Everyday",
  "equipmentType": "surfboard",
  "discipline": "shortboard",
  "boardLengthFeet": 5.11,
  "volumeLiters": 32.6,
  "finSystem": "fcs2",
  "finIncluded": true,
  "wetsuitThickness": "3_2mm"
}
```

#### 테니스 (`sport: "tennis"`)

```json
{
  "sport": "tennis",
  "brand": "Wilson",
  "model": "Pro Staff 97 v14",
  "equipmentType": "racket",
  "headSizeSqIn": 97,
  "weightGrams": 315,
  "gripSize": "2",
  "playStyle": "all_court",
  "strung": true
}
```

---

## 4. 프로필 및 선호 엔터티 (`profiles`, `profile_sports`)

### `profiles`

- `id` (uuid, PK): Supabase Auth subject와 1:1 매핑
- `handle`, `display_name`, `bio`, `avatar_url`: 공개 범위가 제한된 프로필 정보
- `location` (jsonb): 도시·지역·국가·좌표의 strict 객체
- `role`, `is_banned`: 클라이언트가 변경할 수 없는 권한/제재 경계
- `onboarding_completed_at`: 이름과 종목 선호가 준비된 뒤 기록

### `profile_sports`

- `(profile_id, sport_id)` 복합 PK
- `skill_level`: `beginner`, `intermediate`, `advanced`, `expert`
- `size_preferences`: 보드 길이·부력·웻슈트 두께, 라켓 헤드·무게·그립, 신발·의류 사이즈
- `preferences`: `surfDiscipline`, `tennisPlayStyle`, `handedness`

---

## 5. 커뮤니티 및 소셜 엔터티 (`community_posts`, `comments`, `community_reactions`)

- `community_posts`: `discussion`, `question`, `guide`, `meetup`, `review` 글과 게시 상태
- `comments`: active 부모 글의 댓글·대댓글
- `community_reactions`: `(post_id, user_id)` 복합 PK의 1인 1좋아요

---

## 6. 1:1 채팅 및 알림 (`conversations`, `messages`, `push_tokens`)

- `conversations`: 구매자, 판매자, 거래 매물 관계와 참여자 전용 RLS
- `messages`: 본문, 발신자, 발송·읽음·삭제 시각; INSERT Realtime 구독
- `push_tokens`: 로그인 사용자 소유 Expo 토큰, 플랫폼과 선택적 기기 ID

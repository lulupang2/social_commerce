# SummerGear MVP 데이터 모델

> 범위: 기존 MVP 데이터 구조. 내부 회원·입점사·주문·정산의 예정 모델은 [인증 설계](authentication.md)와 [입점사와 거래 설계](commerce.md)에 있습니다. 새 테이블과 FK는 아직 적용되지 않았습니다.

**상태:** 하계 스포츠(서핑 `surf`, 테니스 `tennis`) 스키마 및 마이그레이션 반영 완료.

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

## 2. 장비 거래 엔터티 (`listings`)

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

## 3. 프로필 및 선호 엔터티 (`profiles`, `profile_sports`)

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

## 4. 커뮤니티 및 소셜 엔터티 (`community_posts`, `comments`, `community_reactions`)

- `community_posts`: `discussion`, `question`, `guide`, `meetup`, `review` 글과 게시 상태
- `comments`: active 부모 글의 댓글·대댓글
- `community_reactions`: `(post_id, user_id)` 복합 PK의 1인 1좋아요

---

## 5. 1:1 채팅 및 알림 (`conversations`, `messages`, `push_tokens`)

- `conversations`: 구매자, 판매자, 거래 매물 관계와 참여자 전용 RLS
- `messages`: 본문, 발신자, 발송·읽음·삭제 시각; INSERT Realtime 구독
- `push_tokens`: 로그인 사용자 소유 Expo 토큰, 플랫폼과 선택적 기기 ID

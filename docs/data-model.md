# SummerGear MVP 데이터 모델

**상태:** 하계 스포츠(서핑 `surf`, 테니스 `tennis`) 스키마 및 마이그레이션 반영 완료.

---

## 1. 스포츠 기준 데이터 (`sports`)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `uuid` | PK (서핑: `11111111-...`, 테니스: `22222222-...`) |
| `slug` | `text` | 고유 슬러그 (`surf`, `tennis`) |
| `name` | `text` | 스포츠 한글명 (`서핑`, `테니스`) |
| `description` | `text` | 스포츠 설명 |
| `is_active` | `boolean` | 활성화 여부 |
| `created_at` / `updated_at` | `timestamptz` | 생성 및 수정 시각 |

---

## 2. 장비 거래 엔터티 (`listings`)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `seller_id` | `uuid` | 판매자 `profiles(id)` FK |
| `sport_id` | `uuid` | `sports(id)` FK |
| `category` | `text` | `equipment`, `apparel`, `protective_gear`, `accessories`, `parts`, `other` |
| `title` | `text` | 매물 제목 |
| `description` | `text` | 상세 설명 |
| `price` | `numeric` | 판매 가격 (KRW / USD 등) |
| `currency` | `char(3)` | 통화 코드 (기본 `KRW`) |
| `condition` | `text` | `new`, `like_new`, `good`, `fair`, `poor` |
| `status` | `text` | `draft`, `pending_review`, `active`, `reserved`, `sold`, `archived`, `removed` |
| `details` | `jsonb` | 서핑 또는 테니스 정밀 도메인 스펙 (아래 참조) |
| `location_text` | `text` | 거래 희망 지역 (예: '강원 양양군', '서울 강남구') |
| `published_at` | `timestamptz` | 공개 승인 시각 |

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
  "thicknessMm": null
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
- `handle` (text, unique): 유저 핸들 (예: `demo_surf_house`)
- `display_name` (text): 표시 닉네임
- `bio` (text): 한 줄 소개
- `manner_temperature` (numeric): 기본 매너온도 (예: 36.5)

### `profile_sports`
- `profile_id` (uuid, FK): 프로필 참조
- `sport_id` (uuid, FK): 스포츠 참조
- `skill_level` (text): `beginner`, `intermediate`, `advanced`, `expert`
- `preferences` (jsonb): 선호 장비 브랜드, 플레이 스타일, 선호 거래 지역 등

---

## 4. 커뮤니티 및 소셜 엔터티 (`community_posts`, `community_comments`, `community_reactions`)

- `community_posts`: 서핑 스팟/파도 예보, 테니스 라켓 시타기, 번개 모임 모집 글
- `community_comments`: 게시글별 댓글 및 대댓글
- `community_reactions`: 게시글당 1인 1좋아요(`like`)

---

## 5. 1:1 채팅 엔터티 (`chat_conversations`, `chat_messages`)

- `chat_conversations`: 구매자(`buyer_id`), 판매자(`seller_id`), 거래 매물(`listing_id`) 관계
- `chat_messages`: 대화 메시지 내용, 작성자, 발송 시각, 읽음 여부

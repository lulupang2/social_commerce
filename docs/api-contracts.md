# SummerGear MVP API 계약

**상태:** 하계 스포츠(서핑·테니스) 및 Next.js + WebView API 계약 구현 완료.

---

## 1. 개요

SummerGear는 `@icegear/domain`의 Zod 스키마를 단일 소스로 사용하여 클라이언트와 서버 간 전송 계약을 체결합니다.

---

## 2. 매물 (Listing) API 계약

### 조회 필터 (`ListingFilters`)
```typescript
interface ListingFilters {
  sport?: 'surf' | 'tennis';
  category?: ListingCategory;
  condition?: ListingCondition;
  minPrice?: number;
  maxPrice?: number;
  searchQuery?: string;
  cursor?: string;
  limit?: number;
}
```

### 매물 생성 페이로드 (`CreateListingInput`)
- **공통 필드:** `sport`, `category`, `title`, `description`, `price`, `currency`, `condition`, `locationText`, `images`
- **서핑 상세 (`SurfDetailsInput`):**
  - `equipmentType`: `surfboard` | `wetsuit` | `fin` | `leash` | `accessories` | `other`
  - `discipline`: `shortboard` | `longboard` | `funboard` | `fish` | `gun` | `sup` (선택)
  - `boardLengthFeet`: 숫자 (선택)
  - `volumeLiters`: 숫자 (선택)
  - `finSystem`: `fcs2` | `futures` | `single_fin` | `other` (선택)
  - `thicknessMm`: `2mm` | `3/2mm` | `4/3mm` | `5/4mm` (웻슈트 선택 시)
- **테니스 상세 (`TennisDetailsInput`):**
  - `equipmentType`: `racket` | `bag` | `shoes` | `apparel` | `strings` | `accessories` | `other`
  - `headSizeSqIn`: 숫자 (선택)
  - `weightGrams`: 숫자 (선택)
  - `gripSize`: `1` | `2` | `3` | `4` (선택)
  - `playStyle`: `all_court` | `baseline_aggressive` | `serve_and_volley` | `counter_puncher` (선택)
  - `strung`: 불리언 (선택)

---

## 3. 커뮤니티 (Community) API 계약

- `GET /community`: 종목별(`surf`, `tennis`), 글 유형별(`spot_forecast`, `gear_review`, `meetup`, `free_talk`) 피드 목록 조회
- `POST /community`: 커뮤니티 글 작성 (제목, 본문, 태그, 이미지, 종목)
- `POST /community/:id/comments`: 댓글 작성
- `POST /community/:id/like`: 1인 1좋아요 토글

---

## 4. 1:1 채팅 (Chat) API 계약

- `GET /chats`: 내 참여 대화방 목록 조회 (상대방 프로필, 거래 매물 요약, 최근 메시지)
- `GET /chat/:id`: 대화방 상세 메시지 내역 조회
- `POST /chat/:id/messages`: 메시지 전송 및 실시간 브로드캐스트

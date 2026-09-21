# SummerGear MVP API 계약

> 범위: Go HTTP 계약과 전환 전 Supabase·WebView 계약을 함께 설명합니다. Go 계약의 기준은 [OpenAPI](../apps/api/openapi.yaml)이며 인증 상세는 [인증 설계](authentication.md), 거래 확장은 [입점사와 거래 설계](commerce.md)를 참고합니다.

**상태:** 서비스 세션 인증과 첫 Go 소유 매물 등록·조회·수정 계약을 추가했습니다. Go 매물 이미지 구현 전 공통 계약은 [매물 이미지 계약](listing-images.md)에 고정했으며, B 구현이 이를 OpenAPI에 반영하기 전까지는 준비 계약으로 취급합니다. 기존 Supabase 매물·Storage·Realtime 계약은 전환 완료 전까지 보존합니다.

## Go HTTP 계약

모든 브라우저 호출은 동일 출처 `/api/v1`을 사용합니다. 변경 요청은 서비스 세션 쿠키, 허용 Origin과 `X-CSRF-Token`을 검증합니다. 공통 오류는 `code`, `message`, `requestId`를 반환합니다.

| 메서드·경로 | 역할 |
| --- | --- |
| `GET /api/v1/auth/session` | 현재 내부 회원과 세션·CSRF 조회 |
| `POST /api/v1/auth/dev-login` | 테스트 환경에서만 고정 개발 회원의 실제 서비스 세션 발급 |
| `GET /api/v1/listings` | 공개 `active` Go 매물 최대 24개 조회 |
| `GET /api/v1/listings/{id}` | 공개 매물 또는 현재 회원이 소유한 비공개 매물 조회 |
| `POST /api/v1/listings` | 인증 회원 소유 `pending_review` 매물 생성 |
| `PATCH /api/v1/listings/{id}` | 소유자의 `draft`·`pending_review`·`rejected` 매물 수정 |

Go 매물 생성은 현재 정수 KRW 가격과 도메인 `details`를 검증합니다. 현재 구현에는 아직 Go 이미지 라우트가 없지만 업로드·서명 URL·삭제·교체·소유권의 다음 계약은 [매물 이미지 계약](listing-images.md)에 확정했습니다. 웹은 Go API가 준비된 환경에서 이를 우선 사용하고, Go 경로 자체가 없는 전환 전 환경에서만 기존 Supabase 호출로 돌아갑니다.

---

## 1. 원칙

- 브라우저와 모바일 번들에는 public publishable key만 사용합니다.
- 사용자·소유자 ID, 공개 상태, 읽음 시각은 클라이언트 입력을 신뢰하지 않고 `auth.uid()`와 DB trigger가 결정합니다.
- 외부·저장 데이터는 Zod 또는 SQL check/RLS 경계에서 검증합니다.
- Supabase 연결이 없거나 일시적으로 닿지 않는 웹 개발 환경에서는 명시된 기기 데모 저장소만 사용합니다.

## 2. 매물

### 조회

```typescript
interface ListingFilters {
  sport?: 'surf' | 'tennis';
  category?: 'equipment' | 'apparel' | 'footwear' | 'protective' | 'accessories' | 'other';
  search?: string;
}
```

공개 조회는 `status = 'active'`를 강제합니다. 판매자 정보는 `public_seller_profiles` projection, 사진은 `sign-listing-images` 응답으로 조합합니다.

### 생성

`createListingSchema` 공통 필드는 `sport`, `category`, `title`, `description`, `price`, `currency`, `condition`, `location`입니다. 사진은 payload URL이 아니라 다음 순서로 처리합니다.

1. 판매자 소유 `draft` 매물 생성
2. `<seller_uuid>/<listing_uuid>/<file_name>`에 private 객체 업로드
3. `listing_images` 메타데이터 생성
4. `pending_review` 전이

서핑 상세는 `equipmentType`, `discipline`, `boardLengthFeet`, `boardLengthCm`, `volumeLiters`, `finSystem`, `finIncluded`, `wetsuitThickness`를 사용합니다. 테니스 상세는 `equipmentType`, `playStyle`, `handedness`, `headSizeSqIn`, `weightGrams`, `gripSize`, `stringPattern`, `strung`을 사용합니다.

## 3. 커뮤니티

`createCommunityPostSchema`가 허용하는 글 유형은 `discussion`, `question`, `guide`, `meetup`, `review`입니다. 사용자는 `draft`로 작성하고 운영자가 공개합니다.

- 댓글: `createCommunityCommentSchema`, active 부모 글, 로그인 사용자 소유
- 좋아요: `community_reactions`의 `(post_id, user_id)` 기본키로 1인 1회
- 집계: `community_post_reaction_counts` projection

## 4. 채팅

- 대화방: buyer, seller 참여자만 조회
- 메시지: `createChatMessageSchema`; sender는 현재 세션 사용자
- 실시간: `messages` INSERT PostgreSQL Changes
- 읽음: `mark_conversation_read(conversation_id)` RPC
- 안 읽은 수: `get_my_conversation_unread_counts()` RPC

## 5. 네이티브 브릿지

`nativeBridgeRequestSchema`와 `nativeBridgeResponseSchema`가 다음 메시지를 허용합니다.

- `SUMMERGEAR_PICK_MEDIA`: 카메라/앨범 선택, 1~10장
- `SUMMERGEAR_HAPTIC`: selection/success/warning/error 피드백
- `SUMMERGEAR_REGISTER_PUSH`: Expo push token 요청
- `SUMMERGEAR_LOCAL_NOTIFICATION`: 포그라운드 기기 알림

응답은 `SUMMERGEAR_MEDIA_RESULT`, `SUMMERGEAR_PUSH_TOKEN_RESULT`, `SUMMERGEAR_BRIDGE_ERROR`만 허용합니다. WebView는 동일 출처만 내부 탐색하고 외부 URL은 운영체제 브라우저로 넘깁니다.

# IceGear MVP API 계약

**상태:** 논리 계약은 제안된 형태이며, `packages/domain`이 검증/타입을 제공합니다.
현재 웹·모바일 MVP는 repository를 통해 Supabase에 연결되어 있고, 별도의 HTTP route나 Edge Function 전송 계층은 후속 결정입니다.

이 계약은 direct Supabase client 호출과 Next.js/Edge Function 경계를 모두 지원할 수 있도록 전송 방식과 분리되어 있습니다.
작업별 전송 방식을 바꾸더라도 의미와 authorization 규칙은 바꾸지 않습니다.

## 계약 규칙

- 모든 timestamp는 UTC ISO-8601 문자열입니다.
- client에서 ID는 불투명 UUID 문자열입니다.
- 인증된 owner ID를 권한 신호로 client가 보내지 않습니다. 서버가 session에서 도출합니다.
- 공개 조회는 active/public listing 필드와 승인된 community content만 반환합니다.
- 계정 전용 작업은 유효한 Supabase Auth session이 필요합니다.
- operator/moderator 작업은 명시적으로 검증된 role이 필요합니다.
- JSON request/response는 `camelCase`, database column은 `snake_case`를 사용할 수 있습니다.
- unknown field는 shared validator 정책에 따라 거부하거나 무시하되, 한 가지 행동을 정하고 일관되게 테스트합니다.
- 재시도 가능한 mutation은 idempotency key 또는 database uniqueness constraint를 사용합니다.

## 현재 도메인 용어

현재 domain package에 정의된 값은 다음과 같습니다.

- Sport: `ski`, `hockey`
- Listing category: `equipment`, `apparel`, `protective_gear`, `accessories`, `parts`, `other`
- Listing condition: `new`, `like_new`, `good`, `fair`, `poor`
- Listing 상태: `draft`, `pending_review`, `active`, `reserved`, `sold`, `archived`, `removed`
- Seller type: `individual`, `shop`, `brand`
- Community post type: `discussion`, `question`, `guide`, `review`, `event`, `announcement`
- Reaction kind: `like`, `helpful`, `celebrate`
- Report reason: `spam`, `scam`, `counterfeit`, `prohibited_item`, `harassment`, `hate_speech`, `unsafe_meetup`, `copyright`, `other`

이 값은 구현 근거이지 모든 enum 값이 공개되거나 첫 release에 포함된다는 약속은 아닙니다.
API는 승인된 subset만 노출하고 값이 추가될 때도 forward compatibility를 유지해야 합니다.

## 인증/session 계약

Supabase Auth가 가입, 로그인, refresh, 로그아웃을 담당합니다. 웹은 선택한 Next.js SSR integration을 통해
안전한 HTTP-only cookie를 사용할 수 있고, Expo는 플랫폼에 맞는 안전한 storage adapter를 사용해야 합니다.
provider, callback URL, deep-link scheme은 미결정입니다.

서버 요청에서 유효한 identity는 다음과 같습니다.

```json
{
  "subjectId": "검증된 Supabase session의 uuid",
  "role": "authenticated"
}
```

`subjectId`와 `role`은 request body field가 아니라 검증된 session에서 도출된 값입니다.
service role은 client header나 query string으로 받지 않습니다.

## 공유 응답 형태

### Listing 요약

```json
{
  "id": "2efc2d31-1a0d-4c48-8f8e-11e4c26f12ef",
  "sellerId": "7acb62c3-7b8e-414e-a06e-e68d92a0e6de",
  "sport": "ski",
  "category": "equipment",
  "status": "active",
  "condition": "good",
  "title": "올마운틴 스키",
  "description": "한 시즌 사용한 스키입니다.",
  "price": { "amount": 350, "currency": "USD" },
  "images": [],
  "location": { "city": "Example City", "countryCode": "US" },
  "tags": [],
  "createdAt": "2026-08-13T00:00:00.000Z",
  "updatedAt": "2026-08-13T00:00:00.000Z"
}
```

seller projection, 위치 정밀도, image URL, 공개 status 매핑은 제품/개인정보 결정이 필요합니다.
위 예시는 설명용이며 실제 제품 데이터로 seed하면 안 됩니다.

### 페이지 envelope

```json
{
  "items": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

안정적인 pagination에는 불투명 cursor를 사용합니다. database offset을 지속적인 public 계약으로 노출하지 않습니다.
page size는 서버에서 제한해야 하며 기본/최대값은 미결정입니다.

### 오류 envelope

```json
{
  "error": {
    "code": "validation_error",
    "message": "요청을 처리할 수 없습니다.",
    "requestId": "req_opaque"
  }
}
```

`message`에는 SQL, stack trace, token, private record 정보가 들어가면 안 됩니다.
`requestId`는 지원과 log 추적에 사용합니다. shared schema가 정해지면 민감하지 않은 field-level 오류를 `fields` object로 추가할 수 있습니다.

## Listing 작업 제안

### Active listing 목록

```text
GET /api/listings?sport=<ski|hockey>&category=<value>&condition=<value>&query=<text>&cursor=<opaque>&limit=<bounded>
```

동작:

- anonymous와 인증 사용자는 active/public record만 읽습니다.
- 비어 있거나 없는 filter는 기본 정렬을 사용하며 정확한 정렬은 미결정입니다.
- 검색/filter 의미는 선택한 database/search 구현과 일치해야 합니다.
- 잘못된 limit, cursor, sport, category, condition은 `validation_error`입니다.

응답: page envelope와 listing summary를 담은 `200`.

### Active listing 하나 조회

```text
GET /api/listings/{listingId}
```

동작:

- 먼저 안정적인 UUID로 조회합니다. slug/canonical URL은 선택 사항입니다.
- 없거나 removed이거나 권한 없는 record는 동일한 `404 not_found`로 응답합니다.
- private listing의 존재 여부를 노출하지 않습니다.

응답: 승인된 seller/media projection이 있는 상세 `200`, 또는 오류 envelope의 `404`.

### Listing 생성

```text
POST /api/listings
Idempotency-Key: <opaque key>
```

body는 sport discriminator를 사용하는 shared create payload입니다. 최소 `sport`, `title`, `description`, `category`,
`condition`, `price`, sport별 `details`를 포함하며 image, location, tag, negotiation, shipping은 조건부입니다.

동작:

- 인증된 seller/profile과 승인된 onboarding 조건이 필요합니다.
- `sellerId`는 session에서 도출하고 client owner ID는 무시하거나 거부합니다.
- shared domain schema와 서버 constraint로 payload를 검증합니다.
- 일반 사용자 client가 active를 직접 만들지 못하도록 `draft` 또는 `pending_review`로 생성합니다.

응답: 소유자 projection `201`, `401 unauthenticated`, `403 forbidden`, 또는 `400 validation_error`.

### 소유 listing 수정

```text
PATCH /api/listings/{listingId}
Idempotency-Key: <opaque key>
```

동작:

- 인증 session과 수정 가능한 상태의 소유권이 필요합니다.
- 서버가 `sellerId`, status 전이, timestamp, audit field를 관리합니다.
- active/sold/reserved listing을 임의로 수정하지 못합니다. 정확한 전이 규칙은 미결정입니다.

응답: 수정된 listing `200` 또는 문서화된 오류 envelope.

### Operator listing 전이

```text
POST /api/operator/listings/{listingId}/review
POST /api/operator/listings/{listingId}/activate
POST /api/operator/listings/{listingId}/archive
POST /api/operator/listings/{listingId}/remove
```

예시 route이며 하나의 상태 전이 endpoint가 더 적절할 수 있습니다. 각 작업은 role claim 또는 서버 operator mapping을 확인하고,
허용된 전이와 actor/timestamp audit을 기록하며 안전한 오류를 반환해야 합니다. Supabase session이 있다는 이유만으로
일반 인증 사용자에게 이 route를 노출하지 않습니다.

## Profile/onboarding 작업 제안

```text
GET /api/me
PATCH /api/me
POST /api/me/onboarding
```

`GET`은 인증이 필요하며 승인된 최소 profile 필드만 반환합니다. `PATCH`는 self-service field만 받고 profile subject는 session에서 도출합니다.
현재 domain 계약의 onboarding은 display name과 선호 sport 하나 이상을 요구합니다. username, bio, location, avatar, skill level,
약관 동의, marketing 동의는 제품/개인정보 검토가 필요합니다.

기존 package는 `displayName`/`name`, `preferredSports`/`favoriteSports` 호환 형태를 지원합니다.
wire API는 하나의 canonical spelling을 선택하고 migration 기간에만 validator alias를 유지해야 합니다.

## 조건부 Community 작업

Community가 첫 release에 승인되고 moderation 정책이 마련된 경우에만 다음을 구현합니다.

```text
GET  /api/community/posts?cursor=<opaque>&sport=<ski|hockey>&type=<value>
POST /api/community/posts
GET  /api/community/posts/{postId}
PATCH /api/community/posts/{postId}
DELETE /api/community/posts/{postId}
POST /api/community/posts/{postId}/comments
POST /api/community/posts/{postId}/reactions
DELETE /api/community/posts/{postId}/reactions/{kind}
POST /api/reports
```

규칙:

- 공개 조회는 승인/공개된 콘텐츠만 반환합니다.
- 작성자는 정책이 정한 기간 안에서만 자신의 콘텐츠를 수정/삭제합니다.
- reaction은 선택한 post당 하나 또는 kind별 하나의 DB unique 규칙에 따라 idempotent해야 합니다.
- report의 `reporterId`는 session에서 도출하고 대상 공개 범위를 검증하며 private moderation note를 신고자에게 노출하지 않습니다.
- moderator 작업은 명시적인 role authorization과 audit record가 필요합니다.

현재 domain package는 `message`를 report 대상 후보로도 정의하지만 messaging은 보류되어 있으므로 구현 전에는 거부합니다.

## 보류된 Transaction 작업

domain 계약에는 transaction/fulfillment status가 있지만 MVP API 약속은 아닙니다. seller/payment/legal 결정 전에는 다음을 구현하지 않습니다.

```text
POST /api/listings/{listingId}/offers
POST /api/transactions
POST /api/transactions/{transactionId}/pay
POST /api/transactions/{transactionId}/cancel
POST /api/transactions/{transactionId}/fulfill
```

결제, webhook, refund, 배송 주소, payout, dispute는 별도 계약, idempotency, provider signature 검증, PII/보존 검토가 필요합니다.

## 상태 코드와 오류 코드

최소 매핑:

| HTTP | 코드 | 의미 |
| --- | --- | --- |
| `400` | `validation_error` | 입력, cursor, enum, 상태 전이가 잘못됨 |
| `401` | `unauthenticated` | 유효한 session 필요 |
| `403` | `forbidden` | session은 유효하지만 role/소유권 부족 |
| `404` | `not_found` | 리소스가 없거나 공개 정책상 숨겨짐 |
| `409` | `conflict` | 현재 상태 또는 idempotency key와 충돌 |
| `429` | `rate_limited` | 승인된 limit 초과; 정확한 값은 미결정 |
| `500` | `internal_error` | 예기치 않은 서버 오류; 상세는 log에만 기록 |
| `503` | `dependency_unavailable` | 승인된 의존성 장애; 정보 누출 없이 구분 가능할 때만 사용 |

구현이 시작되면 정확한 오류 코드 registry를 shared domain/contracts package에 둡니다.

## 버전과 호환성

하나의 versioned logical contract로 시작합니다. URL versioning을 사용한다면 외부 consumer가 link를 사용하기 전에 `/api/v1`을 선택합니다.
공개 listing/community URL은 응답 field가 늘어도 안정적으로 유지해야 합니다. field는 호환 방식으로 추가하고 의미를 기존 위치에서 바꾸지 않으며,
breaking change는 ADR에 기록합니다.

## 미결 계약 선택

- 작업별 direct Supabase query, Next.js route handler, Edge Function
- cursor encoding과 기본/최대 page size
- 검색/filter 용어와 정렬 순서
- listing 상태 전이, seller projection, 공개 location 정밀도
- 첫 release에 Community/report를 포함할지와 moderation 상태
- canonical profile field name, Auth provider, deep-link 동작
- operator role 표현과 audit-log 저장 방식
- rate limit, abuse control, public cache header, PII 보존
- save/collection, canonical catalog item, seller offer를 후속 추가할지

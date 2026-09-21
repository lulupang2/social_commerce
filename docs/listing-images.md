# Go 매물 이미지 계약

상태: B·C 병렬 구현 전 공통 계약 고정 · 기준일: 2026-09-21

이 문서는 Go 소유 매물(`summergear_app.listings`)의 이미지 업로드, private Storage, 서명 URL, 소유권 검사와 웹 연결 방식의 공통 기준입니다. 구현 전 계약을 먼저 고정하기 위한 문서이며, B 작업이 이 계약을 `apps/api/openapi.yaml`에 반영한 뒤 Go HTTP 계약의 최종 기준은 OpenAPI가 됩니다.

실제 네이버·카카오 로그인은 이번 범위에서 보류합니다. 이미지 변경 API는 현재 구현된 Go 서비스 세션과 테스트 전용 임시 로그인(`AUTH_DEV_LOGIN_ENABLED`)을 그대로 사용합니다.

## 고정 제약

- Supabase Storage의 기존 private 버킷 `listing-images`를 그대로 사용합니다. public bucket 또는 public URL fallback을 추가하지 않습니다.
- 객체 namespace는 기존 모바일·Storage 정책과 동일하게 `<member_uuid>/<listing_uuid>/<file_name>`을 유지합니다.
- Go 소유 매물 이미지 메타데이터는 기존 `public.listing_images`에 넣지 않고 새 `summergear_app.listing_images`에 저장합니다. 기존 테이블은 `public.listings` FK와 Supabase Auth/RLS에 묶여 있으므로 전환 완료 전 보존합니다.
- 브라우저나 WebView가 service-role 자격 증명을 받지 않습니다. Go가 서비스 세션으로 권한을 확인한 뒤 서버 전용 Storage 자격 증명으로 업로드·삭제·서명합니다.
- 읽기 URL의 TTL은 최대 600초입니다. 응답 URL을 DB에 영구 저장하지 않습니다.
- 한 매물의 이미지 메타데이터는 최대 12개입니다. 기존 네이티브 브릿지의 한 번 선택 최대 10개는 그대로 유지합니다.
- 업로드 허용 형식은 JPEG(`image/jpeg`, `image/jpg`), PNG(`image/png`), WebP(`image/webp`)이며 파일당 최대 10 MiB, 가로·세로 최대 4096px를 기준으로 합니다.
- 클라이언트가 `memberId`, `sellerId`, `storagePath`를 권한 근거로 보내지 않습니다. member ID는 서비스 세션, listing ID는 경로와 DB 소유권 조회에서 결정합니다.

## 데이터 모델

B는 다음 의미를 갖는 `summergear_app.listing_images` migration을 추가합니다.

| 필드 | 계약 |
| --- | --- |
| `id` | UUID PK |
| `listing_id` | `summergear_app.listings(id)` FK, 매물 삭제 시 cascade |
| `storage_path` | private `listing-images` 객체 키, unique |
| `alt_text` | nullable, 공백 제거 후 최대 160자 |
| `sort_order` | 0 이상 정수, 매물 안에서 unique |
| `created_at`, `updated_at` | 서버 시각 |

Go API 역할은 현재 트랜잭션 로컬 `summergear.member_id` 컨텍스트를 사용해 자신의 매물 이미지 행만 변경할 수 있어야 합니다. 브라우저 역할이나 기존 Supabase Auth 사용자가 이 새 테이블에 직접 쓰는 경로는 만들지 않습니다.

Storage 객체 이름은 서버가 생성합니다. 기본 형식은 다음과 같습니다.

```text
<member_uuid>/<listing_uuid>/<image_uuid>.<normalized_extension>
```

교체 시 캐시·동시 요청 충돌을 피하기 위해 새 객체 키를 만들고 메타데이터를 교체한 뒤 이전 객체를 정리합니다. 클라이언트 파일명은 표시 정보로만 취급하고 객체 키로 신뢰하지 않습니다.

## 읽기 응답

Go의 `Listing` 응답에는 `images`를 필수 배열로 추가합니다. `GET /api/v1/listings`, `GET /api/v1/listings/{id}`, `GET /api/v1/listings/{id}/images`는 모두 `sortOrder` 오름차순으로 같은 이미지 상태 계약을 사용합니다.

서명 성공:

```json
{
  "id": "uuid",
  "state": "signed",
  "url": "https://...",
  "expiresAt": "2026-09-21T00:00:00Z",
  "altText": "라켓 전면",
  "sortOrder": 0
}
```

개별 객체가 없거나 개별 서명에 실패했지만 매물 조회 자체는 유효한 경우:

```json
{
  "id": "uuid",
  "state": "unavailable",
  "reason": "not_found",
  "altText": "라켓 전면",
  "sortOrder": 0
}
```

`reason`은 `packages/domain/src/media.ts`의 `not_found | forbidden | expired | signing_failed` 값을 사용합니다. 서버는 접근 불가 매물 자체를 404로 숨기므로 일반 조회에서 개별 이미지 `forbidden`을 권한 판정 대용으로 사용하지 않습니다. 새로 서명할 수 있는 요청에서 `expired`를 만들 필요는 없으며, 클라이언트 캐시 상태 표현용으로 예약합니다.

Storage 서명 서비스 전체가 사용할 수 없는 경우에는 모든 이미지를 `unavailable`로 위장하지 않고 503을 반환합니다. 공개 URL로 대체하지 않습니다.

## HTTP 계약

모든 경로는 기존과 같이 동일 출처 `/api/v1` 기준입니다. 변경 요청은 Go 서비스 세션, 허용 Origin, `X-CSRF-Token`을 검증합니다.

### `GET /api/v1/listings/{listingId}/images`

현재 요청자가 볼 수 있는 매물의 이미지와 새 signed URL을 반환합니다.

응답 200:

```json
{
  "listingId": "uuid",
  "images": []
}
```

- `active` 매물은 익명 조회를 허용합니다.
- 비공개 매물은 현재 Go 매물 조회와 동일하게 소유자만 조회합니다.
- 운영자 역할 확장은 별도 권한 모델이 구현될 때 추가하며 이번 계약에서 가정하지 않습니다.
- 접근할 수 없는 비공개 매물은 존재 여부를 숨기기 위해 `LISTING_NOT_FOUND` 404로 통일합니다.

### `POST /api/v1/listings/{listingId}/images`

소유자가 새 이미지를 1개 추가합니다.

요청: `multipart/form-data`

| 필드 | 필수 | 계약 |
| --- | --- | --- |
| `file` | 예 | 위 형식·10 MiB·4096px 제한 |
| `altText` | 아니오 | 빈 문자열은 미지정으로 정규화, 최대 160자 |
| `sortOrder` | 아니오 | 0 이상 정수. 생략 시 현재 최대값 + 1 |

서버는 요청자가 소유한 `draft | pending_review | rejected` 매물인지 먼저 검사합니다. 그 뒤 서버가 image UUID와 객체 키를 만들고 private Storage에 업로드하고, 업로드 성공 후 메타데이터를 삽입합니다. 메타데이터 삽입이 실패하면 새 객체를 best-effort로 제거하고 실패를 반환합니다.

응답 201은 생성된 이미지 상태 1개입니다. 정상 경로에서는 새 signed URL을 포함한 `state: "signed"`를 반환합니다.

### `PATCH /api/v1/listings/{listingId}/images/{imageId}`

이미지 파일 자체를 바꾸지 않고 표시 메타데이터를 수정합니다.

요청 JSON:

```json
{
  "altText": "라켓 헤드 흠집",
  "sortOrder": 1
}
```

둘 중 하나 이상이 있어야 합니다. 동일 매물에서 중복 `sortOrder`는 허용하지 않습니다. 소유권·상태 검사는 추가와 동일합니다.

응답 200은 갱신된 이미지 상태 1개입니다.

### `PUT /api/v1/listings/{listingId}/images/{imageId}`

이미지 바이너리를 교체하고 이미지 ID와 기본 정렬 위치는 유지합니다.

요청: `multipart/form-data`

| 필드 | 필수 | 계약 |
| --- | --- | --- |
| `file` | 예 | 새 이미지 |
| `altText` | 아니오 | 제공 시 함께 갱신, 미제공 시 기존 값 유지 |

처리 순서는 다음과 같습니다.

1. 소유권과 수정 가능한 상태를 확인합니다.
2. 새 객체 키에 업로드합니다. 기존 객체를 덮어쓰지 않습니다.
3. DB 메타데이터의 `storage_path`와 필요한 표시 정보를 원자적으로 교체합니다.
4. DB 교체 실패 시 새 객체를 제거하고 기존 메타데이터를 유지합니다.
5. DB 교체 성공 후 이전 객체를 제거합니다. 이전 객체 정리에 실패해도 새 이미지는 유효하므로 성공 응답을 유지하되 서버 로그에 민감정보 없이 정리 필요를 남깁니다.

응답 200은 교체된 이미지 상태 1개입니다. 이미 발급된 이전 signed URL은 캐시하지 않아야 하며 교체 뒤 언제든 실패할 수 있습니다.

### `DELETE /api/v1/listings/{listingId}/images/{imageId}`

소유자 이미지 1개를 삭제합니다.

- 소유권·상태 검사는 추가와 동일합니다.
- Storage 객체를 먼저 삭제하며 이미 없는 객체는 삭제 성공으로 취급합니다.
- 그 다음 메타데이터를 삭제합니다.
- Storage 삭제 실패 시 메타데이터를 유지하고 503을 반환합니다.
- Storage 삭제 뒤 DB 삭제가 실패하면 503을 반환합니다. 재시도 시 Storage의 object-not-found를 성공으로 취급해 메타데이터 삭제를 완료할 수 있어야 합니다.
- 성공은 204이며 본문이 없습니다.

## 오류

오류 본문은 기존 Go 공통 envelope를 유지합니다.

```json
{
  "code": "LISTING_IMAGE_INVALID",
  "message": "Listing image information is invalid",
  "requestId": "32-hex-request-id"
}
```

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | `LISTING_IMAGE_INVALID` | 잘못된 multipart/메타데이터/치수/정렬 값 |
| 401 | `UNAUTHENTICATED` | 유효한 Go 서비스 세션 없음 |
| 403 | `CSRF_INVALID`, `ORIGIN_INVALID` | 기존 변경 요청 보호 실패 |
| 404 | `LISTING_NOT_FOUND` | 매물이 없거나 현재 사용자에게 숨겨짐/소유하지 않음 |
| 404 | `LISTING_IMAGE_NOT_FOUND` | 접근 가능한 자기/공개 매물 안에 해당 이미지가 없음 |
| 409 | `LISTING_IMAGE_LIMIT_REACHED` | 12개 제한 초과 |
| 409 | `LISTING_IMAGE_SORT_CONFLICT` | 같은 매물의 정렬 위치 충돌 |
| 409 | `LISTING_IMAGE_STATE_CONFLICT` | 현재 매물 상태에서 이미지 변경 불가 |
| 413 | `LISTING_IMAGE_TOO_LARGE` | 10 MiB 초과 |
| 415 | `LISTING_IMAGE_MEDIA_TYPE_UNSUPPORTED` | 지원하지 않는 MIME/실제 이미지 형식 |
| 503 | `LISTING_IMAGE_STORAGE_UNAVAILABLE` | Storage 업로드·삭제·서명 의존성 사용 불가 |
| 503 | `LISTING_DATABASE_UNAVAILABLE` | 이미지 메타데이터 DB 사용 불가 |

서버는 확장자만으로 MIME을 신뢰하지 않습니다. 내부 Storage 오류 원문, 객체 키, service-role 키는 오류 메시지나 일반 로그에 노출하지 않습니다.

## 등록·수정·상세 연결 절차

### 신규 등록

현재 `POST /api/v1/listings`의 `pending_review` 생성 계약은 이번 병렬 작업에서 바꾸지 않습니다.

1. 웹이 기존 `POST /api/v1/listings`으로 매물 메타데이터를 생성합니다.
2. 응답의 listing ID에 대해 선택된 파일을 `POST .../images`로 추가합니다. 선택 순서대로 `sortOrder=0..n-1`을 보냅니다.
3. 모두 성공하면 상세 화면으로 이동해 서버 응답의 signed 이미지를 사용합니다.
4. 중간 실패 시 C는 이번 등록 시도에서 성공한 image ID만 `DELETE`로 best-effort 정리하고, 매물 자체는 보존합니다. 사용자에게 이미지 재시도가 필요함을 표시하며 Supabase 직접 업로드로 몰래 fallback하지 않습니다.

API는 최대 12개를 허용하지만 현재 WebView picker는 한 번에 최대 10개이므로 C는 기존 선택 한도를 유지해도 됩니다.

### 수정

- 편집 화면은 기존 이미지 ID와 정렬 순서를 유지합니다.
- 파일 교체는 `PUT .../images/{imageId}`, 제거는 `DELETE`, alt text/순서는 `PATCH`를 사용합니다.
- 이미지 변경이 실패하면 텍스트 수정 성공을 이미지 성공으로 표시하지 않습니다. UI는 실패 항목과 재시도 가능 상태를 유지합니다.

### 목록·상세

- C는 Go `Listing.images`의 `state: "signed"`만 실제 `MarketListing.images` URL로 노출합니다.
- `unavailable` 이미지는 public URL이나 raw storage path로 대체하지 않습니다. 화면에서는 placeholder/누락 상태로 처리합니다.
- signed URL 만료 뒤에는 `GET .../images` 또는 매물 재조회로 새 URL을 받습니다.

## 기존 모바일·Supabase 경로와의 호환

- `packages/domain/src/native-bridge.ts`의 `SUMMERGEAR_PICK_MEDIA` 및 `SUMMERGEAR_MEDIA_RESULT` 계약은 변경하지 않습니다. WebView에서 받은 data URL/파일은 웹에서 `File` 또는 `Blob`으로 바꾼 뒤 Go multipart API에 전달합니다.
- `apps/mobile/lib/media`의 기존 Supabase 직접 업로드 유틸은 legacy 경로를 위해 유지합니다. Go 소유 매물에서 새 서비스 세션을 Supabase Auth JWT처럼 사용하지 않습니다.
- 기존 `public.listing_images`, Storage RLS, `sign-listing-images` Edge Function은 legacy `public.listings` 전환 전까지 삭제·완화하지 않습니다.
- Go 이미지 구현은 같은 bucket과 namespace를 사용하되 서버 전용 Storage 권한으로 동작합니다. 기존 사용자 RLS를 우회할 수 있는 자격 증명을 클라이언트에 전달하지 않습니다.

## 서버 설정 이름

B와 D가 서로 다른 이름을 만들지 않도록 다음 이름을 고정합니다.

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
LISTING_IMAGE_BUCKET=listing-images
LISTING_IMAGE_SIGNED_URL_TTL_SECONDS=600
```

`SUPABASE_SERVICE_ROLE_KEY`는 API 서버 전용 비밀입니다. Next.js public env나 Expo 번들에 넣지 않습니다. TTL 설정은 600을 초과하면 시작 단계에서 거부해야 합니다.

## 구현 경계

- B가 OpenAPI, 생성 타입, migration, Go 이미지 라우트·저장소·Storage 어댑터와 서버 테스트를 담당합니다.
- C는 B의 계약과 생성 타입을 소비해 웹 등록·수정·상세 연결 및 웹 테스트만 담당합니다.
- D는 현재 구성에 맞는 배포·CI와 환경변수 예제를 담당하고 API·웹 기능 구현을 수정하지 않습니다.
- 이 문서와 공통 로드맵 문서는 통합 세션이 소유합니다. B·C·D는 공통 문서를 직접 수정하지 않고 필요한 변경점을 완료 보고에 적습니다.

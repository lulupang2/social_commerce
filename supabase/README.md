# SummerGear Supabase

> 전환 참고: 현재 Supabase 기반 구현을 설명합니다. 인증과 서비스 API는 [Go 백엔드](../docs/backend-transition.md)로 이전할 예정이며, 기존 Auth·RLS 의존성은 단계별 검증 전까지 유지합니다. 최종 [ADR 005](../docs/adr/005-supabase-river-toss-test.md)에 따라 DB 호스팅은 Supabase를 유지하며 River를 추가합니다. 아래 내용은 기존 구현 기준이고 Go 인증·River는 구현 전입니다.

이 디렉터리는 SummerGear의 PostgreSQL 스키마, RLS 정책, private Storage, Realtime, Edge Function과 로컬 데모 데이터를 담습니다.

## 마이그레이션

- `0001_init.sql`: 프로필, 스포츠, 매물, 이미지, 찜, 대화, 메시지, 커뮤니티와 기본 RLS
- `0002_profile_reactions.sql`: 종목별 프로필, 1인 1좋아요, 공개 projection, 게시 상태와 감사 이벤트
- `0003_storage_realtime.sql`: private 이미지 namespace, signed URL 권한, 메시지 읽음 RPC, Realtime publication, Edge Function quota
- `0004_summer_domain.sql`: 서핑·테니스 기준 ID 전환, 프로필 JSON 계약, 위치, 사용자 소유 푸시 토큰
- `0005_summer_enums.sql`: 여름 카테고리와 `rejected` enum 추가
- `0006_summer_enum_contracts.sql`: 구 카테고리 마이그레이션, 허용 카테고리 제약, 거절 상태 전이와 감사 이벤트

이미 배포된 마이그레이션은 수정하지 않습니다. 이후 변경은 순서가 증가하는 새 파일로 추가합니다.

## 로컬 실행

Supabase CLI와 실행 중인 Docker가 필요합니다.

```bash
supabase start
supabase db reset
```

`config.toml`의 seed 순서는 다음과 같습니다.

1. `seed.sql`: 모든 환경에서 사용할 수 있는 `surf`, `tennis` 기준 데이터
2. `seed.demo.sql`: 로컬 개발 전용 가상 사용자, 매물 6개, 커뮤니티 글 4개

`seed.demo.sql`은 운영 프로젝트에 자동 적용하지 않습니다. 모든 계정과 콘텐츠는 가상 데이터이며 실제 이메일이나 자격 증명을 포함하지 않습니다.

## 공개 범위와 소유권

- 익명 사용자는 `active` 매물과 게시글만 읽습니다.
- 판매자·작성자는 자신의 비공개 행을 읽고 정해진 상태 전이만 요청할 수 있습니다.
- 판매자 공개 정보는 `public_seller_profiles`, 게시글 작성자 공개 정보는 `public_community_authors` projection으로 제한합니다.
- 찜, 반응, 푸시 토큰, 대화와 메시지는 `auth.uid()` 소유자 또는 참여자에게만 공개됩니다.
- 일반 사용자는 매물을 `draft`로 만든 뒤 `pending_review`만 요청할 수 있습니다.
- 운영자는 `pending_review -> active|rejected|archived|removed`를 처리하며 변경은 `publication_audit_events`에 기록됩니다.

## 이미지

`listing-images` 버킷은 private입니다. 객체 경로는 다음 namespace를 강제합니다.

```text
<seller_uuid>/<listing_uuid>/<file_name>
```

판매자는 자신의 draft에만 객체와 `listing_images` 메타데이터를 추가할 수 있습니다. 읽기 URL은 `sign-listing-images` Edge Function이 권한을 확인한 뒤 최대 600초 signed URL로 반환합니다. 공개 URL fallback은 사용하지 않습니다.

## Realtime 채팅

- `messages` INSERT만 Realtime publication에 포함합니다.
- 참여자만 대화와 메시지를 읽고 보낼 수 있습니다.
- `mark_conversation_read` RPC가 상대방 메시지의 읽음 시각을 일괄 기록합니다.
- `get_my_conversation_unread_counts` RPC는 사용자별 안 읽은 수만 반환합니다.
- 클라이언트는 보낸 메시지와 Realtime 수신 메시지를 ID로 중복 제거합니다.

## Edge Function 검증

각 함수의 import map을 적용해 실행합니다.

```bash
deno test --config functions/recommend-listings/deno.json --allow-env functions/recommend-listings/index.test.ts
deno test --config functions/analyze-listing/deno.json --allow-env functions/analyze-listing/index.test.ts
deno test --config functions/sign-listing-images/deno.json --allow-env functions/sign-listing-images/index.test.ts
```

PostgreSQL/RLS 계약 테스트는 로컬 Supabase가 실행 중일 때 `supabase test db`로 실행합니다.

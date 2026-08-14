# ADR 002: 모바일 MVP 인증·publication·media·표기 경계

- **상태:** 채택됨
- **결정일:** 2026-08-14
- **범위:** Production/demo 인증, profile sport 입력, community like, listing/community publication, listing image, 추천·영향 지표

## 배경

모바일 MVP 구현 계획에는 Auth provider, profile 추천 입력, reaction uniqueness, publication 역할,
Storage 공개 방식, 추천 명칭, 환경 영향 지표가 결정 게이트로 남아 있었습니다. 이 항목은 RLS와 API를
직접 바꾸므로 schema/UI 작업 전에 하나의 보수적인 기준이 필요합니다.

현재 저장소에는 `app_role(user, moderator, admin)`, `sports`, `listings`, `listing_images`,
`community_posts`가 있습니다. 그러나 `0001_init.sql`은 일반 owner의 직접 `active` listing/post 생성을
허용하고, 모바일 listing repository는 `getPublicUrl`을 사용합니다. 이 ADR은 현재 구현을 production-safe라고
선언하지 않고 후속 migration/repository가 충족해야 할 목표 경계를 정합니다.

## 결정

### 1. 인증

- Production MVP provider는 Supabase **email OTP**입니다.
- Production Supabase project에서는 anonymous Auth를 비활성화합니다.
- Anonymous Auth는 별도 non-production Supabase project에서 `EXPO_PUBLIC_ENABLE_DEMO_AUTH=true`를
  명시한 개발/시연 build에만 허용합니다. 기본값은 false이고 production build/release에서는 true를 거부합니다.
- 공개 client flag와 Supabase의 `authenticated` role은 authorization 근거가 아닙니다. RLS와 app role 검증이
  publication 및 private data 접근을 독립적으로 차단합니다.
- Production 연결이나 OTP delivery가 실패해도 demo identity/data로 조용히 fallback하지 않습니다.

### 2. Profile sport와 맞춤 추천 입력

- Canonical 관계는 `profile_sports(profile_id, sport_id, skill_level)`입니다.
- `(profile_id, sport_id)`를 primary key로 사용합니다. `skill_level`, `size_preferences`, `preferences`는
  nullable sport별 값이며 shared schema와 database constraint가 key, 단위, 범위를 검증합니다.
- Profile의 sport 배열이나 전역 skill level은 wire/database 기준으로 사용하지 않습니다.
- 이 값은 맞춤 추천 입력일 뿐 role, publication, 가격 또는 신뢰도 판정에 사용하지 않습니다.

### 3. Community like

- MVP reaction은 `like` 하나뿐이며 `(post_id, user_id)` 행의 존재로 표현합니다.
- Primary key `(post_id, user_id)`가 사용자·게시글당 하나를 강제하고 create/delete는 idempotent합니다.
- `helpful`, `celebrate`와 다중 reaction은 별도 후속 migration 전까지 API/UI에 노출하지 않습니다.
- 공개 응답은 집계 count만 제공하고 reactor identity 목록은 공개하지 않습니다.

### 4. Publication

- 일반 seller는 listing을 항상 `draft`로 생성하고 자기 draft를 `pending_review`로 제출할 수만 있습니다.
- 기존 `moderator`/`admin` app role을 MVP listing operator로 사용하며 이 역할만
  `pending_review → active` publication을 수행합니다.
- 일반 author는 community post를 항상 `draft`로 생성합니다. `moderator`/`admin`만 `draft → active`로 공개합니다.
- Client가 보낸 owner/author ID 또는 active status를 권한 신호로 신뢰하지 않습니다.
- Publication/moderation은 session role, old/new status, RLS/trigger를 함께 검증하고 actor, target, action,
  timestamp를 감사 기록에 남깁니다. Public read는 active row와 승인된 projection에만 허용합니다.

### 5. Listing image

- Storage bucket 이름은 `listing-images`이고 항상 private입니다. Postgres `listing_images.storage_path`에는
  URL이 아닌 object key만 저장합니다.
- Public/anonymous는 active listing image, owner는 자기 draft image, `moderator`/`admin`은 검토 대상만 sign할 수 있습니다.
- 신뢰된 signer가 권한 확인 후 최대 10분 signed URL과 만료 시각을 반환합니다.
- Public bucket, 영구 URL, raw object path, `getPublicUrl` fallback을 금지합니다. Sign/refresh 실패는 명시적인
  unavailable/error 상태로 처리하며 다른 URL 형태로 강등하지 않습니다.

### 6. 추천과 영향 표기

- 사용자 입력과 결정론적 규칙으로 만든 결과의 명칭은 **맞춤 추천** 또는 **추천 이유**입니다.
  실제 model 호출이 없는 결과를 AI 추천·AI 분석이라고 부르지 않습니다.
- 사용자에게 노출하는 거래/재사용 숫자는 안정적인 완료 record ID와 완료 시각으로 재계산할 수 있어야 합니다.
  기준 데이터가 없으면 숫자를 숨기며 local state, active/sold label, demo seed를 production 성과로 집계하지 않습니다.
- 검증 가능한 계산·methodology가 없는 CO2/CO₂, 탄소 절감, 나무 환산 등의 환경 영향 주장을 MVP에서 금지합니다.

## 보안 경계

```text
Production email OTP session
          │
          ├── user ── own draft/profile_sports/like only
          │
          └── moderator/admin ── trusted server/RLS publication + audit

private listing-images ── authorized signer ── signed URL (TTL <= 10 minutes)
```

- Public Supabase key는 project 식별/접속 설정일 뿐 권한이 아닙니다.
- Service-role key가 필요한 signer/publication 작업은 trusted runtime에만 두고 client bundle에는 포함하지 않습니다.
- Signed URL 수명은 database visibility와 object policy를 대체하지 않습니다.
- 접근할 수 없는 row/object는 존재 여부를 누출하지 않는 not-found/unavailable 의미를 사용합니다.

## Demo와 production 동작

| 항목 | Development/demo | Production |
| --- | --- | --- |
| Auth | explicit flag + 별도 demo project일 때 anonymous 허용 가능 | email OTP만, anonymous provider/flag off |
| 장애 fallback | demo임을 명시한 fixture/identity만 사용 | demo data/identity로 fallback 금지 |
| Publication | demo seed는 명시적으로 demo 표시; role 경계 테스트 | moderator/admin + audit + RLS 필수 |
| Image | private bucket/signing 경계를 그대로 연습 | private bucket, 최대 10분 signed URL만 |
| 지표 | demo 수치는 demo로 표시하고 제품 성과로 사용하지 않음 | 감사 가능한 완료 record 기반 count만 |

Demo flag는 보안 경계가 아니며 production project 또는 production data와 함께 사용하지 않습니다.

## 결과

### 장점

- Anonymous identity, owner-supplied status, 영구 media URL을 통한 우회 범위를 줄입니다.
- Profile 추천 입력과 like uniqueness가 하나의 relational source of truth를 가집니다.
- Listing과 community가 같은 역할·감사 원칙을 공유합니다.
- 규칙 기반 기능과 환경 성과를 과장하지 않아 사용자에게 검증 가능한 표현만 제공합니다.

### 비용과 제약

- `profile_sports`, `community_reactions`, audit, RLS 보정을 위한 새 migration과 actor별 DB test가 필요합니다.
- Publication에는 moderator/admin 운영 queue 또는 최소한의 trusted endpoint가 필요해 즉시 공개보다 단계가 늘어납니다.
- Private image는 signing endpoint, URL refresh, unavailable UI, 고아 object 정리가 필요합니다.
- Email delivery, redirect/deep-link, rate limit, operator 계정은 hosted Supabase/배포 환경에서 별도로 설정·검증해야 합니다.
- 현재 domain reaction enum과 mobile `getPublicUrl` 구현은 호환 수정 전까지 이 ADR과 일치하지 않습니다.

## 검토한 대안

### Production anonymous Auth

가입 마찰은 낮지만 anonymous session도 Supabase에서 인증 role을 가질 수 있어 write/RLS 오구성의 영향을 키웁니다.
MVP production에서는 email OTP로 identity와 지원 경계를 명확히 합니다.

### Owner 즉시 공개

구현은 단순하지만 현재 community/listing 모두 moderation과 report 준비가 부족합니다. Draft와 operator publication을
선택해 공개 전 검토와 감사를 우선합니다.

### Public Storage와 `getPublicUrl`

URL 발급은 쉽지만 draft/removed image가 path만 알면 장기간 노출될 수 있습니다. Private bucket과 짧은 signed URL을 선택합니다.

### 다중 reaction과 CO₂ 환산

초기 engagement와 impact 표현은 풍부해 보이지만 uniqueness, abuse, methodology 근거가 없습니다.
One-like와 audit 가능한 count만 유지하고 나머지는 별도 근거와 migration이 생긴 뒤 검토합니다.

## 구현 및 외부 선행 조건

1. `0001_init.sql`을 수정하지 않고 새 migration에서 publication RLS/trigger, `profile_sports`, one-like, audit를 추가합니다.
2. `listing-images` private bucket/object policy와 authorized signer를 만들고 `getPublicUrl` 경로를 제거합니다.
3. Domain/API/repository/UI가 draft, pending review, one-like, signed expiry, 맞춤 추천 label을 동일하게 사용하도록 테스트합니다.
4. Hosted production Supabase에서 email OTP delivery/redirect/rate limit을 설정하고 anonymous provider가 꺼졌는지 확인합니다.
5. Production moderator/admin identity와 audit 보존 절차를 운영자가 승인합니다.

4~5는 repository만으로 도달하거나 검증할 수 없는 외부 선행 조건입니다. 완료 전에는 production publication과
anonymous/demo 전환, listing image upload를 활성화하지 않습니다.

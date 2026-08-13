# IceGear MVP 아키텍처

**상태:** MVP 기준 구현 완료. 현재 저장소에는 `packages/domain`, Next.js 웹 앱,
Expo Router 모바일 앱, Supabase migration/seed가 있으며, 실제 프로젝트 연결과 운영 환경 설정은 별도 작업입니다.

이 문서는 기술 스택을 실제 경계와 책임으로 구체화합니다. 화면 구조나 시각 디자인은 정의하지 않습니다.

## 시스템 컨텍스트

```text
Expo 모바일  ───────┐
                    ├── 공유 계약/검증 ─── Supabase Auth + Postgres + RLS
Next.js 웹 ─────────┘                         └── Storage(승인 시)
       │
       └── 권한 작업/다단계 작업 ─── Next.js 서버 경계 또는 Edge Function
```

다이어그램은 논리적 소유권을 나타내며 특정 호스팅 업체나 UI 라우트 구조를 확정하지 않습니다.

## 컴포넌트별 책임

### Expo 모바일

- 모바일 클라이언트를 렌더링하고 공유 계약을 사용합니다.
- 플랫폼에 맞는 안전한 세션 저장소를 통해 Supabase Auth를 사용합니다.
- 번들에는 공개 Supabase 설정만 포함합니다.
- 단순하고 안전한 RLS 보호 작업만 Supabase에 직접 호출합니다.
  권한 작업이나 다단계 작업은 승인된 서버 경계를 사용합니다.
- 오프라인/세션 만료 상황을 처리하되, 클라이언트 판단을 권한 검증으로 간주하지 않습니다.

### Next.js 웹

- 웹 클라이언트를 렌더링하고 listing/community 공유를 위한 표준 public URL을 제공합니다.
- 선택한 Supabase SSR 패턴으로 웹 인증 cookie와 세션을 관리합니다.
- 여러 클라이언트가 함께 써야 하는 안정적인 서버 경계가 필요한 계약에만 route handler를 노출합니다.
- service credential은 서버 전용 모듈과 배포 secret에만 둡니다.
- 공개 listing/community 링크의 metadata를 생성하거나 읽되 private 필드를 노출하지 않습니다.

### Supabase

- Supabase Auth가 자격 증명과 identity 생명주기를 담당합니다.
- Postgres가 카탈로그, profile, 사용자 소유 관계의 기준 데이터입니다.
- 모든 애플리케이션 테이블의 데이터 경계에서 RLS가 접근을 강제합니다.
- Storage는 선택 기능이며, media 요구사항이 승인되기 전에는 기본 비공개로 유지합니다.
- Edge Function은 Next.js 배포 밖에서 실행하거나 데이터베이스 가까이에서 실행해야 하는 작업의 선택지입니다.
  작업별 선택은 아직 확정하지 않았습니다.

### 공유 패키지

현재 `packages/domain`이 첫 번째 공유 계약 계층입니다. 각 앱에 도메인 규칙을 복사하지 말고 작고
프레임워크 독립적으로 유지합니다.

- 현재 모델링된 sport, listing, seller/transaction/community/report, profile/onboarding의 Zod validator와 TypeScript 타입
- 향후 ID, pagination, API payload, write input validator
- 전송 계약이 구현되면 API 오류/페이지네이션 형태
- status enum과 지원 protocol version 같은 비밀이 아닌 상수

클라이언트 전용 표현 코드, secret, 데이터베이스 관리자 클라이언트, 플랫폼 저장소 adapter는 공유 패키지에 넣지 않습니다.

## 요청 및 데이터 흐름

### 공개 카탈로그 조회

1. 클라이언트가 공개 listing 목록 또는 listing/community 리소스를 요청합니다.
2. endpoint 결정에 따라 공개 Supabase client 또는 Next.js route handler를 사용합니다.
3. 데이터베이스 쿼리는 active listing과 승인된 community content만 필터링합니다.
4. RLS가 private 행이 반환되지 않도록 독립적으로 방어합니다.
5. 클라이언트는 안정적이고 버전이 관리되는 응답 형태를 받습니다.

### 인증된 사용자 관계 저장

1. 클라이언트가 Supabase Auth session을 확보합니다.
2. 저장 mutation은 session context를 전달하며, 클라이언트가 보낸 owner ID를 신뢰하지 않습니다.
3. 데이터베이스가 소유권과 승인된 unique key를 검사해 안전한 재시도를 가능하게 합니다.
4. RLS가 현재 사용자가 자신의 관계만 추가/삭제하도록 허용합니다. 예: 향후 save 또는 reaction.
5. 이후 목록 조회는 제품 계약이 허용한 관계만 반환합니다.

### 권한 있는 공개 전환

1. operator session이 서버 route 또는 function에 도달합니다.
2. 서버가 session, role, 입력값, listing/community 상태 전이를 검증합니다.
3. 가능한 경우 하나의 transaction에서 listing/moderation 데이터와 audit event를 기록합니다.
4. 전이가 성공한 뒤에만 공개 조회가 새 상태를 봅니다.
5. service key가 필요하다면 trusted runtime에서만 읽고 클라이언트에는 절대 보내지 않습니다.

## 저장소 경계

```text
apps/mobile/       Expo 앱
apps/web/          Next.js 앱
packages/domain    프레임워크 독립 도메인 타입과 Zod 스키마
supabase/migrations 순서가 있는 SQL migration과 RLS
supabase/functions 선택적 Edge Function
docs/              제품·엔지니어링 계약
```

현재 root workspace와 lockfile, 두 앱, domain 패키지, migration/seed가 구현되어 있습니다.
실제 Supabase `config.toml`, hosted project 연결, service-role client는 저장소에 포함하지 않습니다.

## 신뢰 경계

| 경계 | 신뢰할 수 없는 입력 | 필수 통제 |
| --- | --- | --- |
| 모바일/웹 ↔ Supabase | ID, filter, payload, session 상태 | RLS, 스키마 검증, DB constraint |
| Browser ↔ Next.js route | header, cookie, JSON, query string | session 검증, 입력 검증, 필요 시 rate limit |
| Server ↔ Supabase 관리자 API | 내부 작업 데이터와 credential | 서버 전용 모듈, 최소 권한, audit log |
| 사용자 업로드 ↔ Storage | 파일 내용, metadata, filename | 용량/형식 검사, 비공개 bucket, 안전한 경로, signed access |
| 외부 provider ↔ webhook | 재전송 가능한 HTTP 요청 | signature 검증, idempotency, event log; provider 승인 후에만 |

## 가용성과 실패 처리

MVP는 숨겨진 재시도보다 명시적이고 복구 가능한 오류를 우선합니다.

- 공개 조회는 결과가 없을 때 제한된 빈 결과를 반환할 수 있습니다.
- 없거나 권한이 없는 리소스는 문서화된 not-found 동작을 사용합니다.
- Auth 만료 시 무한 재시도 대신 refresh 또는 재로그인을 안내합니다.
- 사용자가 안전하게 재시도할 수 있는 write는 idempotent하게 설계합니다. 예: save.
- 권한 작업 실패가 일부만 공개된 상태를 남기지 않도록 합니다.
- 외부 integration과 background job은 후속 범위이며 queue/retry provider는 선택하지 않았습니다.

## 관측성과 감사

기본 log에는 request correlation ID, operation name, status, latency, 비민감 actor type을 포함합니다.
access token, service key, password, private profile 전체, 업로드 콘텐츠는 기록하지 않습니다.
권한 있는 카탈로그 변경은 actor, target, action, timestamp가 있는 audit record를 남겨야 합니다.
오류 보고 도구와 보존 기간은 privacy 검토 후 결정합니다.

## 확장 전략

MVP listing/profile/community 조회 경로에 맞춘 Postgres query와 index로 시작합니다.
측정과 제품 결정 없이 검색 인프라나 비정규화 feed를 먼저 도입하지 않습니다.
운영 비용을 정당화할 측정 결과가 있을 때만 전용 검색/indexing, cache, queue, materialized view를 추가합니다.

## 미결 아키텍처 결정

- 작업별 direct Supabase 호출, Next.js route handler, Edge Function 선택
- Next.js와 Supabase의 hosting 및 preview 전략
- MVP media 포함 여부와 Storage bucket/policy
- Auth provider, refresh/deep-link 동작, 삭제 semantics
- catalog item이 하나의 source를 갖는지, 여러 listing이 독립적인지
- social write 확대 전 rate limit, abuse control, audit 보존 정책

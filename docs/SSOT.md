# IceGear MVP 단일 기준 문서(SSOT)

**상태:** 모바일 MVP 고도화(하단 탭, 당근마켓풍 거래 UI, 커뮤니티·채팅 vertical slice)와 `social_commerce` 데모 데이터 적용까지 완료했습니다. 운영용 moderation·실시간성·인증 정책은 후속 작업입니다.

**최종 검토일:** 2026-08-14

이 문서는 IceGear MVP의 짧고 오래 유지되는 기준입니다. 확정된 사실, 구현을 위한 제안,
아직 결정하지 않은 항목을 구분합니다. 픽셀 단위의 시각 디자인은 정의하지 않지만, 현재 모바일 정보 구조와
vertical slice 범위는 [모바일 MVP 가이드](mobile-mvp.md)에 기록합니다.

## 문서 읽는 법

- **확정(Confirmed):** 현재 제품 요청 또는 저장소에서 확인된 사실입니다.
- **제안(Proposed):** 구현을 시작하기 위한 실용적 가정이며 제품 검증이 필요합니다.
- **미결정(Unresolved):** 팀이 결정해야 하며 다른 문서가 이를 조용히 제품 약속으로 바꾸면 안 됩니다.

제안이 결정으로 바뀌면 이 문서와 관련 ADR/지원 문서를 같은 변경에서 함께 갱신합니다.

## 제품 정의와 범위

### 확정

IceGear는 겨울 스포츠 중고거래·커뮤니티 MVP의 작업명입니다. 구현 스택은 Expo, Next.js, Supabase, pnpm입니다.
저장소에는 root workspace/lockfile, Next.js 웹 MVP, Expo Router 모바일 MVP, Zod를 사용하는
`packages/domain` 계약, Supabase migration/seed, 공개 환경변수 예시가 있습니다.
실제 Supabase project와 runtime 값은 커밋하지 않습니다.

### 제안하는 제품 역할

IceGear는 겨울 스포츠 장비를 발견하고 등록하며 정보를 나누는 서비스입니다.
현재 domain 계약의 sport는 **ski**와 **hockey**이며 seller listing, profile/onboarding,
community post/comment/reaction, report, transaction lifecycle을 모델링합니다.
MVP에서는 listing과 profile 기반을 먼저 안정화하고 결제·fulfillment 복잡도는 뒤로 미룹니다.

현재 sport 범위는 ski와 hockey입니다. domain package는 equipment category, condition, currency,
location, media metadata, seller type을 제안하지만 어떤 필드와 지역을 첫 release에 필수로 할지는 제품 승인이 필요합니다.
모든 transaction/community 상태를 첫 release에 포함할지는 미결정입니다.

### 제안하는 MVP 범위

1. 인증 사용자가 최소 profile/onboarding을 완료하고 선호 sport와 선택적인 skill level을 저장합니다.
2. 사용자가 active ski/hockey listing을 제목, 설명, condition, price/currency, image, 위치, tag, sport별 상세로 탐색합니다.
3. 인증 seller가 검증된 계약으로 listing을 제출하고 승인된 operator가 공개 여부를 관리합니다.
4. moderation/report 정책이 승인된 경우에만 community post/comment/reaction을 공개합니다.
5. 사용자가 허용된 대상과 사유로 report를 만들고 operator가 처리합니다.
6. 모든 write는 인증 owner 또는 명시된 operator role을 가지며 Supabase RLS가 저장 데이터를 보호합니다.
7. 모바일은 홈·커뮤니티·판매·채팅·나의 IceGear 하단 탭으로 핵심 흐름을 제공합니다.
8. 인증 전에는 공개 상품·커뮤니티·데모 채팅을 탐색할 수 있고, 글 작성·판매·실제 메시지 전송은 인증 경계를 통과합니다.

Transaction은 향후 reservation/handoff를 위해 모델링할 수 있지만 payment provider와 fulfillment 자동화는 MVP에 포함하지 않습니다.
save/collection, follow, messaging, recommendation feed는 현재 domain package에 표현되지 않았으며 미결정입니다.

### MVP 밖의 범위

- 결제, checkout, 환불, 세금, 배송, fulfillment, 반품
- seller payout, commission, identity verification, marketplace dispute
- 실시간 transport·읽음 동기화·push notification campaign을 포함한 운영용 채팅 인프라
- moderation/report 정책 없이 공개하는 community content
- 행동 데이터나 ML이 필요한 recommendation/ranking 모델
- 승인되지 않은 통화, 지역, inventory 정책
- 웹 전용 또는 native 전용으로 두 클라이언트를 분리시키는 기능
- 운영용 design system, pixel-level visual QA, 고급 검색/추천 UI

## 작업 Persona

| Persona | 목표 | MVP 필요 | 보호 장치 |
| --- | --- | --- | --- |
| 장비 탐색자/구매자 | sport·용도·예산에 맞는 장비 찾기 | 공개 listing 탐색과 item 정보 | privacy 결정 전 public read를 계정 필수로 만들지 않음 |
| 판매자/listing owner | 장비를 정확히 설명하고 판매 제안 | 검증된 listing 생성과 상태 확인 | payout, 배송, marketplace 보장을 가정하지 않음 |
| 커뮤니티 참여자 | 지식 공유와 질문/답변 | 승인된 post/comment/reaction | moderation과 report 없이 UGC를 공개하지 않음 |
| listing/operator | listing과 publication 상태 유지 | 검토·활성화·보관·삭제와 수정 경로 | operator 작업은 audit와 서버/RLS로 보호 |
| moderator/support | 신고와 안전 이슈 처리 | role 제한 report 검토 | role, queue, 보존 정책은 미결정 |

첫 release의 중심은 장비 탐색자와 listing owner입니다. Community 참여자는 moderation 결정에 따라 조건부이며,
operator/moderator는 별도 admin 앱 약속이 아니라 운영 요구사항입니다.

## 사용자 흐름

흐름은 business outcome과 데이터 경계를 설명하며 화면이나 layout을 규정하지 않습니다.

### Active listing 탐색 및 상세 조회(제안)

1. 방문자가 listing 페이지 또는 sport/category 결과를 요청합니다.
2. 서비스가 active/visible listing과 허용된 필드만 반환합니다.
3. 방문자가 안정적인 ID로 listing을 요청합니다.
4. 서비스가 listing, public media, 승인된 seller summary, sport별 상세를 반환합니다.
5. 없거나 숨겨진 listing은 private record의 존재를 밝히지 않는 동일한 not-found 결과를 사용합니다.

### Listing 생성과 검토(제안)

1. seller가 Supabase Auth로 로그인하고 최소 profile/onboarding을 완료합니다.
2. client가 sport discriminator가 있는 listing payload를 보냅니다.
3. 공유 검증이 category, condition, price/currency, image, location, sport별 상세를 검사합니다.
4. 서버가 session subject를 seller로 지정하고 draft 또는 review-pending listing과 ownership을 기록합니다.
5. 승인된 operator가 active로 전환하거나 moderation 정책에 따라 반려/삭제합니다.

### Profile/onboarding 완료(제안)

1. 사용자가 활성화된 Supabase Auth provider로 인증합니다.
2. display name과 하나 이상의 선호 sport를 입력하고, 선택적으로 username, bio, location, avatar, skill level을 입력합니다.
3. 서버가 profile을 인증 subject와 연결하고 self-service 변경을 검증합니다.
4. 사용자는 허용된 profile 필드만 읽고 수정합니다.

### Community 참여(조건부)

1. 인증 사용자가 승인된 post/comment type을 제출합니다.
2. 서비스가 소유권, content 길이, 대상 공개 범위를 검증합니다.
3. reaction과 수정/삭제는 명시된 moderation 정책을 따릅니다.
4. 사용자가 위험하거나 부적절한 콘텐츠/listing을 report합니다.
5. moderator/operator가 audit 가능한 방식으로 처리합니다.

모바일 MVP에는 위 정책을 전제로 한 커뮤니티 피드·상세·작성 화면과 로컬 댓글/좋아요 상호작용이 먼저 포함되어 있습니다.
실제 게시·moderation은 Supabase Auth/RLS와 운영 정책이 준비된 환경에서 활성화합니다.

### 거래 채팅(제안)

1. 상품 상세의 문의 버튼이 채팅 목록으로 이동합니다.
2. 인증 사용자는 conversation participant인지 확인된 대화만 읽고 메시지를 작성합니다.
3. 인증 전 또는 데모 환경에서는 시연용 conversation과 로컬 메시지를 표시합니다.
4. 실시간 구독, 읽음 상태, 차단·신고·push 알림은 후속 vertical slice에서 확정합니다.

### 안정적인 listing/community 공유(제안)

1. 사용자가 표시된 리소스의 canonical URL/ID를 얻습니다.
2. 플랫폼 공유 기능을 사용할 수 있으며 특정 UI에 의존하지 않습니다.
3. 수신자는 보낸 사람의 session이나 private data를 상속하지 않고 public 리소스를 엽니다.

### Operator publication(제안)

1. operator가 승인된 role로 인증합니다.
2. 서버 작업이 listing/moderation 전이를 검증합니다.
3. RLS와 서버 authorization이 일반 사용자의 publication field 변경을 막습니다.
4. actor와 timestamp를 기록해 지원/감사가 가능하도록 합니다.

### 계정 생명주기(제안)

1. 사용자가 활성화된 Auth provider로 가입/로그인합니다.
2. profile 행을 생성하거나 인증 subject와 동기화합니다.
3. self-service로 허용된 field만 수정합니다.
4. 로그아웃 시 local session을 폐기하고 계정 전용 작업 접근을 제거합니다.

### 결제/fulfillment 흐름(명시적 보류)

`listing → offer/reservation → checkout → payment → order → fulfillment`는 미래 흐름입니다.
transaction 의미, provider, 법률 조건, 지역 범위가 결정되기 전에는 payment UI, webhook, payout, 배송 자동화를 만들지 않습니다.

## 도메인 용어

| 용어 | 의미 | 주의 |
| --- | --- | --- |
| IceGear | 제품과 서비스 이름 | 필요하지 않으면 테이블명으로 사용하지 않음 |
| Sport | 지원되는 gear/community 영역; 현재 `ski` 또는 `hockey` | sport 추가는 제품/스키마 결정 |
| Listing | 판매자가 소유한 장비 판매 제안/record | 미래의 canonical catalog item과 구분 |
| Catalog item | seller 제안과 독립적인 canonical gear record | 현재 domain에 없음 |
| Seller | listing에 연결된 개인·shop·brand 계정 | 검증/payout 의미는 미결정 |
| Active | 선택한 정책에 따라 공개되고 판매 가능한 listing | status 전이는 UI 결정이 아님 |
| Save | 미래의 사용자 소유 관계 | 구매를 save로 표현하지 않음 |
| Community post | discussion, question, guide, review, event, announcement 형태의 사용자 콘텐츠 | moderation/report 필요 |
| Reaction | post에 대한 like/helpful/celebrate 신호 | count·uniqueness·abuse 정책 미결정 |
| Profile | `auth.users`와 연결된 애플리케이션 identity 정보 | credential은 Supabase Auth 소유 |
| Operator | catalog/publication을 관리하는 신뢰된 담당자 | role claim은 미결정 |
| Moderator | UGC/report를 검토하는 담당자 | social content 승인 전에는 필요하지 않음 |
| Report | 콘텐츠나 데이터를 표시하는 신고 record | 대상/보존 정책 필요 |
| Transaction | 미래의 buyer/seller/listing/금액/lifecycle 관계 | payment/fulfillment는 보류 |
| Public data | session 없이 반환해도 안전한 데이터 | query와 RLS 모두로 강제 |
| Private data | owner 또는 명시된 role만 접근하는 데이터 | profile, save, report 기본값 |

## 아키텍처 결정

### 확정 스택

- **pnpm:** workspace, dependency graph, 공통 script
- **Expo / React Native:** 모바일 client
- **Next.js:** 웹 client와 서버 실행 경계
- **Supabase:** Postgres, Auth, RLS, 승인된 경우 Storage/Edge Function

근거와 trade-off는 [ADR 001](adr/001-stack.md)에 기록되어 있습니다.

### 경계 원칙

```text
Expo 모바일 ──┐
              ├── 공유 타입/검증 ── Supabase Auth + RLS 보호 데이터
Next.js 웹 ───┘                 └── 권한 작업은 서버 route/Edge Function
```

클라이언트는 단순한 RLS 보호 read와 사용자 소유 write에 public Supabase client를 사용할 수 있습니다.
여러 record를 결합하거나 secret, publication 상태, 외부 provider, idempotency가 필요한 작업은 서버 경계를 통과합니다.

### 현재 workspace 구조

```text
apps/
  mobile/       Expo 앱(하단 탭·상품·커뮤니티·채팅·프로필)
  web/          Next.js 앱
packages/
  domain/       프레임워크 독립 타입/검증 계약
supabase/
  migrations/   순서가 있는 SQL migration과 RLS
  seed.sql      스포츠 기준 데이터
docs/           제품·엔지니어링 문서
```

현재 웹은 request-scoped public Supabase client로 읽고, 모바일은 public client로 active listing·community를 조회하고
인증 session이 있으면 draft listing·community post·message 생성을 수행합니다. 미인증 화면은 안전한 demo fallback을 사용합니다.
Supabase `config.toml`, hosted project link, service-role client는 저장하지 않습니다.

## 보안과 RLS 원칙

1. **Default deny:** 모든 애플리케이션 테이블에 RLS를 활성화하고 문서화된 사용 사례만 허용합니다.
2. **Database subject 사용:** ownership policy는 client user ID가 아닌 `auth.uid()`를 기준으로 합니다.
3. **Public은 승인된 visible 데이터:** active listing과 승인된 community만 anonymous read에 포함합니다.
4. **Client에 service key 금지:** service-role, DB password, payment/webhook secret은 trusted server에서만 사용합니다.
5. **이중 방어:** route/server authorization과 RLS를 함께 사용합니다.
6. **개인정보 최소화:** 인증은 Auth에 두고 제품에 필요한 profile field만 저장합니다.
7. **입력 경계 검증:** shape, 길이, enum, ID, URL, 상태 전이를 서버와 database에서 검증합니다.
8. **안전한 media:** Storage를 사용할 때 bucket은 기본 비공개, 제한 media는 signed URL을 사용합니다.
9. **권한 작업 감사:** publication, moderation, correction에 actor/timestamp를 기록합니다.
10. **Side-channel 방지:** 접근할 수 없는 record는 일관된 not-found로 처리하고 내부 오류를 노출하지 않습니다.

RLS는 anonymous, 일반 인증 사용자, owner, operator identity로 테스트해야 합니다.
[개발 가이드](development.md)와 [데이터 모델](data-model.md)을 함께 확인합니다.

## 환경변수

아래 이름만 계약으로 정의하며 실제 값은 커밋하지 않습니다.

| 변수 | 소비자 | 민감도 | 목적 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Next.js browser/server | 공개 설정 | 웹 Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Next.js browser/server | 공개 설정 | RLS로 제한되는 publishable/anon key |
| `EXPO_PUBLIC_SUPABASE_URL` | Expo | 공개 설정 | 모바일 Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Expo | 공개 설정 | RLS로 제한되는 모바일 publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | trusted server/CI만 | 비밀 | 명시적으로 필요한 권한 작업/마이그레이션 |

Public key는 authorization이 아닙니다. 각 환경은 자신의 Supabase project를 가리켜야 하며,
production 값은 배포 시스템이나 secret manager가 주입해야 합니다. 웹·모바일 client는 public URL과 publishable key만 읽고,
service-role key는 읽거나 bundle에 포함하지 않습니다.

## 현재 구현 상태

현재 저장소에서 확인되는 내용:

- **구현 완료:** root pnpm workspace/lockfile, ski/hockey domain 계약과 Zod test, 웹 marketplace browse/detail과 health route,
  모바일 하단 탭·당근마켓풍 홈/상품 상세·판매 작성, 커뮤니티 피드/상세/작성, 채팅 목록/대화, 프로필 화면,
  active listing/community 조회와 validated draft/post/message 생성 경계, public-key-only Supabase client,
  `supabase/migrations/0001_init.sql`의 RLS, `supabase/seed.sql`의 스포츠 데이터,
  `supabase/seed.demo.sql`의 익명 데모 판매자 3명·활성 상품 14개·커뮤니티 글 4개·placeholder 이미지
- **검증 완료:** `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`,
  `pnpm format:check`, `pnpm export:mobile:web`; 공개 Supabase 값이 없을 때 setup 상태 렌더링
- **연결 환경에서 필요한 작업:** 실제 사용자 Auth provider와 profile/onboarding, listing 이미지 Storage,
  anonymous/owner/operator RLS 검증, moderation·댓글/반응 persistence, 실시간 채팅과 listing publication 운영 화면
- **현재 MVP 밖:** payment/checkout, fulfillment, payout, production 배포/CI, analytics,
  실시간/push 채팅 인프라와 운영 moderation workflow
- **의미:** 공개 browse용 데모 데이터는 연결되었지만, 인증된 write와 운영 데이터는 Supabase Auth/RLS 및 운영 정책에 의존합니다.

## 미결정 사항

| 영역 | 필요한 결정 | 영향 |
| --- | --- | --- |
| 제품 taxonomy | sport/category/attribute/condition/지역의 첫 release 범위 | listing schema, 검색, 검증, seed |
| Commerce 모델 | peer marketplace, 단일 seller, catalog/affiliate 중 무엇인지 | ownership, order, payment, legal |
| Social 기능 | 현재 community/chat demo를 어떤 persistence·moderation 정책으로 승격할지 | moderation, abuse, privacy, metric |
| Identity | Auth provider와 recovery 규칙 | client flow, callback URL, support |
| Listing 운영 | 누가 create/edit/activate하고 report를 어떻게 처리하는지 | role, audit, moderation, operator 도구 |
| Media | image가 MVP 필수인지와 upload 승인 주체 | Storage bucket, 변환, 저작권, RLS |
| API 경계 | direct Supabase와 Next.js route/Edge Function의 작업별 분할 | 배포, 생성 client, secret, 테스트 |
| Search | Postgres 검색, hosted search, 후속 기능 중 선택 | index, ranking, 비용, sync |
| 환경 | 웹/모바일 build와 Supabase/preview 배포 위치 | variable injection, release |
| Privacy/retention | profile, telemetry, content 보존/삭제 규칙 | schema, consent, support |

## 지원 문서

- [아키텍처](architecture.md): 시스템 경계, 데이터 흐름, 운영 원칙
- [데이터 모델](data-model.md): entity, constraint, index, RLS 소유권
- [개발 가이드](development.md): 로컬 설정, workflow, 검증, release 위생
- [API 계약](api-contracts.md): cross-client 작업과 응답/오류 규칙
- [ADR 001](adr/001-stack.md): Expo + Next.js + Supabase + pnpm 선택 이유

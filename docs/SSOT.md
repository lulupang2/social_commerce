# IceGear MVP 단일 기준 문서(SSOT)

**상태:** 모바일 MVP 구현 전 결정 게이트(`T00`)를 확정했습니다. 현재 코드와 최초 migration에는 아래 정책과 다른 부분이 있으므로 후속 migration/RLS·repository·UI 작업이 필요합니다.

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

1. 인증 사용자가 최소 profile/onboarding을 완료하고 `profile_sports`에 선호 sport와 선택적인 sport별 skill/size/preference를 저장합니다.
2. 사용자가 active ski/hockey listing을 제목, 설명, condition, price/currency, image, 위치, tag, sport별 상세로 탐색합니다.
3. 인증 seller가 검증된 계약으로 draft listing을 만들고 검토를 요청하며, `moderator` 또는 `admin` operator만 active로 공개합니다.
4. 일반 사용자는 community post를 draft로 만들고 `moderator` 또는 `admin`만 active로 공개합니다. MVP reaction은 사용자·게시글당 하나의 `like`입니다.
5. 사용자가 허용된 대상과 사유로 report를 만들고 operator가 처리합니다.
6. 모든 write는 인증 owner 또는 명시된 operator role을 가지며 Supabase RLS가 저장 데이터를 보호합니다.
7. 모바일은 홈·커뮤니티·판매·채팅·나의 IceGear 하단 탭으로 핵심 흐름을 제공합니다.
8. 인증 전에는 공개 상품·커뮤니티를 탐색할 수 있습니다. 데모 채팅은 명시적인 non-production demo mode에서만 표시하고, 글 작성·판매·실제 메시지 전송은 인증 경계를 통과합니다.

Transaction은 향후 reservation/handoff를 위해 모델링할 수 있지만 payment provider와 fulfillment 자동화는 MVP에 포함하지 않습니다.
save/collection과 follow는 현재 domain package에 표현되지 않았으며 미결정입니다. MVP의 추천은 사용자 입력과 명시적 규칙으로 계산하는 **맞춤 추천**입니다.

## 모바일 MVP 결정 기준(확정)

다음 항목은 2026-08-14에 `T00`으로 확정했으며 구현 편의를 이유로 완화할 수 없습니다. 상세 근거와 결과는
[ADR 002](adr/002-mobile-mvp-safety-boundaries.md)에 기록합니다.

| 영역 | 확정 결정 |
| --- | --- |
| Production 인증 | Supabase email OTP를 사용합니다. production에서는 anonymous Auth를 비활성화합니다. |
| 개발/시연 인증 | non-production에서만 `EXPO_PUBLIC_ENABLE_DEMO_AUTH=true`를 명시하고 별도 demo Supabase project가 anonymous Auth를 허용한 경우 사용할 수 있습니다. 기본값은 false이며 이 client flag를 authorization 근거로 사용하지 않습니다. |
| Profile sport | canonical 관계는 `profile_sports(profile_id, sport_id, skill_level)`입니다. `(profile_id, sport_id)`는 unique/PK이고 `skill_level`, `size_preferences`, `preferences`는 선택적인 sport별 값입니다. |
| Community like | MVP는 사용자·게시글당 정확히 하나의 `like`만 허용합니다. 다중 reaction 종류는 후속 migration 전까지 API/UI에 노출하지 않습니다. |
| Listing 공개 | seller는 `draft`로 생성하고 `pending_review`까지만 요청할 수 있습니다. `moderator`/`admin` operator만 감사 기록이 남는 경계에서 `active`로 공개합니다. |
| Community 공개 | 일반 사용자는 post를 `draft`로 생성합니다. `moderator`/`admin`만 감사 기록이 남는 경계에서 `active`로 공개합니다. |
| Listing image | private `listing-images` bucket과 최대 10분의 signed URL만 사용합니다. 공개 bucket, 영구 URL, `getPublicUrl` fallback을 금지합니다. |
| 추천 표기 | 규칙 기반 결과는 **맞춤 추천** 또는 **추천 이유**로만 표시하며 AI라고 부르지 않습니다. |
| 영향 지표 | audit 가능한 완료 거래 수와 재사용 건수만 표시합니다. 근거 없는 CO2/CO₂ 절감량 또는 환산치는 표시하지 않습니다. |

현재 `0001_init.sql`이 일반 사용자의 직접 `active` 생성/전이를 허용하고 모바일 listing repository가
`getPublicUrl`을 사용하는 부분은 위 기준에 부합하지 않는 알려진 구현 차이입니다. production 연결 전에 새 migration과
repository 변경으로 닫고 actor별 RLS/Storage 테스트를 통과해야 합니다.

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
| 커뮤니티 참여자 | 지식 공유와 질문/답변 | 승인된 post/comment/like | moderation과 report 없이 UGC를 공개하지 않음 |
| listing/operator | listing과 publication 상태 유지 | 검토·활성화·보관·삭제와 수정 경로 | operator 작업은 audit와 서버/RLS로 보호 |
| moderator/support | 신고와 안전 이슈 처리 | role 제한 report 검토 | role, queue, 보존 정책은 미결정 |

첫 release의 중심은 장비 탐색자와 listing owner입니다. Community 참여자는 확정된 publication 경계의 구현 여부에 따라 조건부이며,
operator/moderator는 별도 admin 앱 약속이 아니라 운영 요구사항입니다.

## 사용자 흐름

흐름은 business outcome과 데이터 경계를 설명하며 화면이나 layout을 규정하지 않습니다.

### Active listing 탐색 및 상세 조회(제안)

1. 방문자가 listing 페이지 또는 sport/category 결과를 요청합니다.
2. 서비스가 active/visible listing과 허용된 필드만 반환합니다.
3. 방문자가 안정적인 ID로 listing을 요청합니다.
4. 서비스가 listing, 짧은 수명의 signed media projection, 승인된 seller summary, sport별 상세를 반환합니다.
5. 없거나 숨겨진 listing은 private record의 존재를 밝히지 않는 동일한 not-found 결과를 사용합니다.

### Listing 생성과 검토(확정)

1. seller가 Supabase Auth로 로그인하고 최소 profile/onboarding을 완료합니다.
2. client가 sport discriminator가 있는 listing payload를 보냅니다.
3. 공유 검증이 category, condition, price/currency, image, location, sport별 상세를 검사합니다.
4. 서버가 session subject를 seller로 지정하고 항상 `draft` listing과 ownership을 기록합니다. 일반 seller가 보낸 `active` status는 거부합니다.
5. seller는 수정이 끝난 draft를 `pending_review`로 제출할 수 있지만 공개할 수는 없습니다.
6. 기존 `app_role`의 `moderator` 또는 `admin` operator만 검토된 서버/RLS 경계에서 `active`로 전환하거나 반려·보관·삭제하며 actor와 timestamp를 기록합니다.

### Profile/onboarding 완료(확정)

1. production 사용자는 Supabase email OTP로 인증합니다. anonymous Auth는 명시적인 non-production demo 조건에서만 허용합니다.
2. display name과 하나 이상의 선호 sport를 입력하고, 선택적으로 username, bio, location, avatar와 sport별 skill/size/preference를 입력합니다.
3. 서버가 profile을 인증 subject와 연결하고 각 sport를 `profile_sports` 한 행으로 upsert합니다.
4. 사용자는 허용된 profile 및 자신의 `profile_sports` 행만 읽고 수정합니다.

### Community 참여(확정된 publication 경계)

1. 인증 사용자가 승인된 post type을 제출하면 서비스는 항상 `draft`로 저장합니다.
2. 서비스가 소유권, content 길이, 대상 공개 범위를 검증합니다.
3. `moderator` 또는 `admin`만 post를 `active`로 공개할 수 있고 actor/timestamp audit을 남깁니다.
4. 인증 사용자는 active post에 사용자·게시글당 하나의 `like`를 idempotent하게 추가하거나 삭제합니다.
5. 사용자가 위험하거나 부적절한 콘텐츠/listing을 report하고 moderator가 audit 가능한 방식으로 처리합니다.

모바일 MVP에는 위 정책을 전제로 한 커뮤니티 피드·상세·작성 화면과 로컬 댓글/좋아요 상호작용이 먼저 포함되어 있습니다.
실제 게시·moderation은 위 publication 규칙을 강제하는 Supabase Auth/RLS와 운영 경계가 준비된 환경에서만 활성화합니다.

### 거래 채팅(제안)

1. 상품 상세의 문의 버튼이 채팅 목록으로 이동합니다.
2. 인증 사용자는 conversation participant인지 확인된 대화만 읽고 메시지를 작성합니다.
3. 인증 전 또는 데모 환경에서는 시연용 conversation과 로컬 메시지를 표시합니다.
4. 실시간 구독, 읽음 상태, 차단·신고·push 알림은 후속 vertical slice에서 확정합니다.

### 안정적인 listing/community 공유(제안)

1. 사용자가 표시된 리소스의 canonical URL/ID를 얻습니다.
2. 플랫폼 공유 기능을 사용할 수 있으며 특정 UI에 의존하지 않습니다.
3. 수신자는 보낸 사람의 session이나 private data를 상속하지 않고 public 리소스를 엽니다.

### Operator publication(확정)

1. operator가 `moderator` 또는 `admin` role로 인증합니다.
2. 서버 작업이 listing/moderation 전이를 검증합니다.
3. RLS와 서버 authorization이 일반 사용자의 publication field 변경을 막습니다.
4. actor와 timestamp를 기록해 지원/감사가 가능하도록 합니다.

### 계정 생명주기(확정된 인증 진입)

1. production 사용자는 email OTP로 가입/로그인합니다. anonymous sign-in은 production에서 비활성화합니다.
2. profile 행을 생성하거나 인증 subject와 동기화합니다.
3. self-service로 허용된 field만 수정합니다.
4. 로그아웃 시 local session을 폐기하고 계정 전용 작업 접근을 제거합니다.

### 결제/fulfillment 흐름(명시적 보류)

`listing → offer/reservation → checkout → payment → order → fulfillment`는 미래 흐름입니다.
transaction 의미, provider, 법률 조건, 지역 범위가 결정되기 전에는 payment UI, webhook, payout, 배송 자동화를 만들지 않습니다.

### 재사용/거래 지표(확정)

프로필이나 추천 화면에 숫자를 표시한다면 완료된 거래 또는 인수 기록의 안정적인 ID와 완료 시각으로 다시 계산할 수 있어야 합니다.
하나의 감사 가능한 완료 record를 하나의 거래 건으로 세고, 그 record에 연결된 실제 장비 수만 재사용 건수로 집계합니다.
현재처럼 transaction/handoff 기준 데이터가 없는 환경에서는 placeholder나 seed를 production 지표로 표시하지 않습니다.
추정 CO2/CO₂, 탄소 절감, 나무 환산 등 검증되지 않은 환경 영향 수치는 MVP에서 표시하지 않습니다.

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
| Like | active post에 대한 MVP reaction | `(post_id, user_id)`당 하나; 종류 선택 없음 |
| Profile | `auth.users`와 연결된 애플리케이션 identity 정보 | credential은 Supabase Auth 소유 |
| Operator | listing publication을 관리하는 `moderator` 또는 `admin` | role과 상태 전이를 서버/RLS에서 검증하고 감사 기록 필요 |
| Moderator | community publication과 UGC/report를 검토하는 `moderator` 또는 `admin` | 일반 사용자는 active 전이 불가 |
| Report | 콘텐츠나 데이터를 표시하는 신고 record | 대상/보존 정책 필요 |
| Transaction | 미래의 buyer/seller/listing/금액/lifecycle 관계 | payment/fulfillment는 보류 |
| Public data | session 없이 반환해도 안전한 데이터 | query와 RLS 모두로 강제 |
| Private data | owner 또는 명시된 role만 접근하는 데이터 | profile, save, report 기본값 |
| 맞춤 추천 | 사용자 입력과 명시적 규칙으로 계산한 추천 | 규칙 결과를 AI로 표기하지 않음 |

## 아키텍처 결정

### 확정 스택

- **pnpm:** workspace, dependency graph, 공통 script
- **Expo / React Native:** 모바일 client
- **Next.js:** 웹 client와 서버 실행 경계
- **Supabase:** Postgres, Auth, RLS, 승인된 경우 Storage/Edge Function

스택 근거와 trade-off는 [ADR 001](adr/001-stack.md), MVP의 인증·publication·media·표기 경계는
[ADR 002](adr/002-mobile-mvp-safety-boundaries.md)에 기록되어 있습니다.

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

현재 웹은 request-scoped public Supabase client로 읽고, 모바일은 public client로 active listing·community를 조회합니다.
미인증 demo fallback과 anonymous Auth는 명시적인 non-production demo mode에서만 사용할 수 있습니다. production에서
Supabase 연결이나 인증이 실패하면 demo 데이터로 조용히 대체하지 않고 setup/error/login 상태를 표시합니다.
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
11. **Production Auth 고정:** email OTP만 활성화하고 anonymous Auth는 비활성화합니다. demo flag는 client 표시 제어일 뿐 권한 근거가 아닙니다.
12. **Signed media 전용:** `listing-images` object path는 공개 응답에 노출하지 않고 최대 10분 signed URL만 반환합니다. `getPublicUrl` fallback은 없습니다.

RLS는 anonymous, 일반 인증 사용자, owner, moderator, admin identity로 테스트해야 합니다.
[개발 가이드](development.md)와 [데이터 모델](data-model.md)을 함께 확인합니다.

## 환경변수

아래 이름만 계약으로 정의하며 실제 값은 커밋하지 않습니다.

| 변수 | 소비자 | 민감도 | 목적 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Next.js browser/server | 공개 설정 | 웹 Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Next.js browser/server | 공개 설정 | RLS로 제한되는 publishable/anon key |
| `EXPO_PUBLIC_SUPABASE_URL` | Expo | 공개 설정 | 모바일 Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Expo | 공개 설정 | RLS로 제한되는 모바일 publishable key |
| `EXPO_PUBLIC_ENABLE_DEMO_AUTH` | Expo non-production만 | 공개 설정 | 명시적으로 `true`일 때만 demo/anonymous Auth UI 허용; 기본 false, production 금지 |
| `SUPABASE_SERVICE_ROLE_KEY` | trusted server/CI만 | 비밀 | 명시적으로 필요한 권한 작업/마이그레이션 |

Public key는 authorization이 아닙니다. 각 환경은 자신의 Supabase project를 가리켜야 하며,
production 값은 배포 시스템이나 secret manager가 주입해야 합니다. 웹·모바일 client는 public URL과 publishable key만 읽고,
service-role key는 읽거나 bundle에 포함하지 않습니다.

Production Supabase project 자체에서도 anonymous provider를 꺼야 하며 email OTP 전달, redirect/deep-link, rate limit을
운영 환경에서 검증해야 합니다. `EXPO_PUBLIC_ENABLE_DEMO_AUTH`는 이 server-side 설정이나 RLS를 대체하지 않습니다.

## 현재 구현 상태

현재 저장소에서 확인되는 내용:

- **구현 완료:** root pnpm workspace/lockfile, ski/hockey domain 계약과 Zod test, 웹 marketplace browse/detail과 health route,
  모바일 하단 탭·당근마켓풍 홈/상품 상세·판매 작성, 커뮤니티 피드/상세/작성, 채팅 목록/대화, 프로필 화면,
  active listing/community 조회와 validated draft/post/message 생성 경계, public-key-only Supabase client,
  `supabase/migrations/0001_init.sql`의 RLS, `supabase/seed.sql`의 스포츠 데이터,
  `supabase/seed.demo.sql`의 익명 데모 판매자 3명·활성 상품 14개·커뮤니티 글 4개·placeholder 이미지
- **검증 완료:** `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`,
  `pnpm format:check`, `pnpm export:mobile:web`; 공개 Supabase 값이 없을 때 setup 상태 렌더링
- **결정 완료:** production email OTP, non-production 전용 anonymous Auth, canonical `profile_sports`, post당 one-like,
  operator/moderator publication, private signed listing image, 맞춤 추천 표기, audit 가능한 거래/재사용 지표
- **연결 환경에서 필요한 작업:** email OTP/SMTP와 anonymous provider 설정, profile/onboarding migration, private `listing-images` Storage와 signer,
  anonymous/owner/moderator/admin RLS 검증, moderation·댓글/like persistence, 실시간 채팅과 publication 운영 경계
- **알려진 구현 차이:** `0001_init.sql`은 owner의 직접 active listing/post 생성을 허용하고 모바일 repository는
  `getPublicUrl`을 사용합니다. T21/T22/T24/T26에서 새 migration과 repository로 수정하기 전에는 production-ready가 아닙니다.
- **현재 MVP 밖:** payment/checkout, fulfillment, payout, production 배포/CI, analytics,
  실시간/push 채팅 인프라와 운영 moderation workflow
- **의미:** 공개 browse용 데모 데이터는 연결되었지만, 인증된 write와 운영 데이터는 Supabase Auth/RLS 및 운영 정책에 의존합니다.

## 미결정 사항

| 영역 | 필요한 결정 | 영향 |
| --- | --- | --- |
| 제품 taxonomy | sport/category/attribute/condition/지역의 첫 release 범위 | listing schema, 검색, 검증, seed |
| Commerce 모델 | peer marketplace, 단일 seller, catalog/affiliate 중 무엇인지 | ownership, order, payment, legal |
| Social 운영 | comment moderation, chat persistence와 abuse/rate-limit 정책 | moderation, abuse, privacy |
| Identity 운영 | email OTP delivery provider, recovery/support, redirect/deep-link 값 | 배포 설정, callback, support |
| Listing 운영 | moderator/admin queue와 반려·재심 운영 절차 | operator 도구, audit 보존 |
| Media 처리 | image 변환 규격, 저작권, 고아 object 정리 주기 | worker, 보존, 운영 비용 |
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
- [ADR 002](adr/002-mobile-mvp-safety-boundaries.md): 인증, profile, publication, private media, 표기 결정

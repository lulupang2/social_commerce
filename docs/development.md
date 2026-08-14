# IceGear MVP 개발 가이드

**상태:** 모바일 하단 탭·거래 UI·커뮤니티·채팅 vertical slice와 연결된 Supabase 데모 데이터까지 구성되었습니다. 운영용 moderation·실시간성은 후속 작업입니다.

저장소에는 pnpm workspace, Next.js 웹 MVP, Expo Router 모바일 MVP, 공유 `packages/domain` 계약,
Supabase migration과 결정적인 seed가 있습니다. 커밋된 `.env.example`에는 placeholder만 있으며,
Supabase credential이나 service-role key는 저장소에 넣지 않습니다.

## 사전 요구사항

저장소의 toolchain 파일에 고정된 버전을 사용합니다.

- Node.js 22.13.0 이상 (`.node-version` 참고)
- pnpm 10.34.5 (root `packageManager` 필드로 고정)
- Git
- 로컬 database/Auth 개발이 필요할 때 Supabase CLI
- native 대상 개발 시 Xcode/iOS Simulator 또는 Android Studio/emulator
- Next.js 앱을 실행할 지원 브라우저

검증 매트릭스를 재현할 때는 고정 버전을 사용합니다.

## Workspace 설정

깨끗한 checkout에서 의존성을 설치하고 Supabase 프로젝트 없이 실행할 수 있는 검사를 수행합니다.

```sh
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm format:check
pnpm export:mobile:web
```

공개 Supabase 변수가 없으면 웹과 모바일은 의도적으로 설정 안내 상태를 렌더링합니다.
연결된 개발을 하려면 예시 파일을 복사하고 공개 project URL/publishable key를 입력한 뒤,
Supabase 프로젝트를 설정 또는 연결하고 migration을 적용한 다음 `pnpm dev`를 실행합니다.
현재 연결된 `social_commerce` 프로젝트에는 `supabase/seed.demo.sql`로 데모 판매자 3명,
활성 상품 14개(스키 7개·하키 7개), 커뮤니티 글 4개, placeholder 이미지가 적용되어 있습니다.

### 현재 스크립트

| 명령 | 목적 | 상태 |
| --- | --- | --- |
| `pnpm dev` | 웹과 모바일 개발 프로세스를 병렬 실행 | 사용 가능 |
| `pnpm dev:web` | Next.js 웹 앱 실행 | 사용 가능 |
| `pnpm dev:mobile` | Expo 도구 실행 | 사용 가능 |
| `pnpm dev:mobile:web` | Expo Web 앱 실행 | 사용 가능 |
| `pnpm --dir packages/domain typecheck` | 공유 domain 패키지 타입 검사 | 사용 가능 |
| `pnpm --dir packages/domain test` | domain 검증 테스트 실행 | 사용 가능 |
| `pnpm --dir packages/domain build` | domain 패키지 빌드 | 사용 가능; 무시되는 `dist/` 생성 |
| `pnpm lint` | workspace 앱 lint 실행 | 사용 가능 |
| `pnpm typecheck` | 모든 workspace 패키지 타입 검사 | 사용 가능 |
| `pnpm test` | 사용 가능한 package/web 테스트 실행 | 사용 가능 |
| `pnpm build` | 웹과 domain 패키지 빌드 | 사용 가능 |
| `pnpm format:check` | 저장소 파일 Prettier 검사 | 사용 가능 |
| `pnpm export:mobile:web` | Expo 앱의 web export | 사용 가능; 무시되는 `apps/mobile/dist/` 생성 |
| `supabase db reset` | 로컬 DB 재생성 후 migration/seed 적용 | Supabase CLI 설정 필요 |

스크립트는 오류를 숨기지 않고 반복 실행해도 안전해야 합니다. RLS를 우회하거나 운영 service key를
로컬에서 사용하는 스크립트를 추가하지 않습니다.

## 환경 파일

local, preview/staging, production은 서로 다른 환경 값을 사용합니다.
현재 매핑은 [SSOT 환경변수](SSOT.md#환경변수)를 기준으로 합니다.

권장 로컬 파일명은 다음과 같습니다.

```text
apps/web/.env.local       # 무시됨; 웹 공개 + 서버 설정
apps/mobile/.env          # 무시됨; Expo 공개 설정만
.env.example              # 커밋되는 이름과 안전한 placeholder
```

규칙:

- `apps/web/.env.example`와 `apps/mobile/.env.example`은 변수 이름 참고용으로 유지합니다.
- service-role key, database password, Auth client secret, provider webhook secret을 커밋하지 않습니다.
- `NEXT_PUBLIC_`와 `EXPO_PUBLIC_`에는 client bundle에 공개해도 되는 값만 사용합니다.
- 웹은 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, 모바일은 `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 사용합니다.
  웹 설정은 레거시 호환을 위해 `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 별칭으로 허용합니다.
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용이며 shared module이나 client bundle로 전달하지 않습니다.
- 각 환경은 분리된 Supabase project/database를 가리켜야 합니다.

## 로컬 Supabase workflow

migration 우선 workflow는 `supabase/migrations/0001_init.sql`에 반영되어 있습니다.
기준 스포츠만 필요한 경우 `supabase/seed.sql`, 시연 상품까지 필요한 경우 `supabase/seed.demo.sql`을 사용합니다.

1. 순서가 있는 SQL migration을 생성하거나 갱신합니다.
2. 테이블 변경과 같은 migration에서 RLS와 정책을 함께 정의합니다.
3. 문서화된 query path에 필요한 constraint와 index를 추가합니다.
4. Supabase 프로젝트를 설정/연결하고 처음부터 모든 migration을 적용하도록 reset합니다.
5. 기준 데이터만 필요하면 `supabase/seed.sql`, 시연 화면이 필요하면 `supabase/seed.demo.sql`을 실행합니다.
   데모 seed의 Auth 레코드는 익명 판매자이며 실제 로그인 계정으로 사용하지 않습니다.
6. anonymous, 인증된 owner, 다른 사용자, operator 권한을 각각 테스트합니다.
7. 생성된 타입을 채택한다면 database type을 재생성합니다. 현재 웹 앱은 커밋된 타입 snapshot을 사용합니다.

Migration에 없는 Dashboard 수동 변경은 만들지 않습니다. 불가피하다면 관련 ADR에 이유와 재현 방법을 기록합니다.

## 코딩 규칙

- 공유 패키지와 앱 모두 TypeScript strict 설정을 유지합니다.
- 도메인 계약은 각 앱에 복사하지 말고 `packages/domain`에 둡니다.
- 모든 외부 입력은 서버 경계에서 검증합니다. 클라이언트 검증은 사용자 피드백용일 뿐 신뢰 경계가 아닙니다.
- [도메인 용어](SSOT.md#도메인-용어)의 `listing`, `community_post`, `transaction`, `profile`을 구분합니다.
- 서버 전용 모듈과 client 모듈을 분리하고 Expo/browser에 secret이 import되지 않도록 build-time 검사를 추가합니다.
- 필요한 authorization context를 노출하는 작고 조합 가능한 data-access 함수를 선호합니다.
- 재시도가 가능한 write는 idempotent하게 만들고 문서화된 오류 코드를 반환합니다.
- UI layout이나 design-system 규칙은 domain 문서에 넣지 않고 별도 design 문서에서 결정합니다.
- 모바일 text와 input은 `apps/mobile/lib/typography.tsx`의 공통 primitive를 사용합니다. 새 화면에서
  React Native `Text`/`TextInput`을 직접 사용하면 Pretendard weight mapping이 적용되지 않습니다.
- 모바일 폰트는 `apps/mobile/assets/fonts`의 공식 정적 배포본과 함께 OFL 파일을 유지합니다.
  폰트를 추가하거나 교체할 때 Expo config, runtime loader, 라이선스 문서를 같은 변경에서 갱신합니다.

## 테스트 전략

현재 baseline에는 domain Zod 검증 테스트와 웹 repository 테스트가 있습니다.

- `packages/domain/tests`의 sport별 listing 및 profile/onboarding 입력 검증 테스트
- 향후 shared ID, pagination, 오류 helper, 계약 validator 단위 테스트
- 인증/비인증 context를 사용한 웹/서버 계약 테스트
- foreign key, uniqueness, 공개 상태 constraint, RLS 정책 테스트
- 공개 listing 조회, 로그인/session 복원, listing 등록/검토, 승인된 community/report flow smoke test
- 웹·모바일 build/type check는 로컬에서 실행 가능하며 CI 연결은 후속 작업입니다.

모든 RLS 정책은 최소한 다음을 검증해야 합니다.

```text
anonymous   -> 공개 active listing/승인된 콘텐츠만
owner       -> 자신의 profile/listing/content만
other user  -> 다른 사용자의 private 행을 읽거나 수정할 수 없음
operator    -> 승인된 listing/moderation 작업만
```

커밋된 migration에는 RLS 정책이 있지만, 실제 로컬/hosted Supabase에서 anonymous/owner/operator를
검증하는 작업은 프로젝트 설정 후 진행합니다. service-role 테스트 성공만으로 client 접근이 안전하다고 판단하지 않습니다.

## 변경 workflow

각 변경은 하나의 명확한 결과를 가져야 합니다.

1. 동작이 바뀌면 관련 계약 또는 ADR을 업데이트합니다.
2. 스키마 변경에는 migration과 테스트를 함께 추가합니다.
3. format, lint, typecheck, test, 영향받은 앱 build를 실행합니다.
4. 생성 파일과 환경변수에서 실수로 secret이 포함되지 않았는지 확인합니다.
5. 미결정 사항은 코드 기본값에 숨기지 말고 기록합니다.

문서만 바꾸는 경우 Markdown 링크/reference와 `git diff --check`를 확인하며 애플리케이션 코드를 수정하지 않습니다.

## Release 위생

production release 전 다음을 결정해야 합니다.

- 웹/모바일 버전 조정 방식
- Supabase migration 승격 및 rollback 방식
- 환경 값과 Auth redirect URL 관리
- operator 작업 권한과 회수 방식
- 오류, audit event, privacy 요청, incident 보존 정책
- 두 플랫폼의 deep link와 canonical share URL 테스트

이 결정 전에는 지원되는 production 배포 절차가 없습니다.

## 문제 해결 체크리스트

- **데이터가 보이지 않음:** Supabase URL, 환경, publication 상태, RLS 정책을 확인하고 진단을 위해 RLS를 끄지 않습니다.
- **세션이 사라짐:** 플랫폼 storage/cookie adapter와 Auth redirect를 확인하고 service key를 client에 넣지 않습니다.
- **저장이 반복/중복됨:** composite unique key와 idempotent mutation 계약을 확인합니다.
- **웹/모바일 결과가 다름:** shared schema/version과 환경별 project ID를 비교합니다.
- **migration이 로컬에서만 동작함:** 처음부터 reset하고 migration 커밋과 Dashboard-only 변경을 확인합니다.
- **공개 응답이 필드를 누출함:** query/view와 서버 응답 shaping을 확인합니다. RLS만으로 public projection을 대신하지 않습니다.

## 현재 상태

root workspace script, 웹·모바일 MVP client, 공유 계약, RLS migration, 결정적인 스포츠 seed가 구현되어 있습니다.
로컬 검증 매트릭스(`pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`,
`pnpm format:check`, `pnpm export:mobile:web`)는 통과합니다.
모바일 MVP의 공개 feed는 바로 확인할 수 있고, 판매/커뮤니티 작성/실제 채팅 전송은 게스트 Auth 또는 실제 Auth 설정이 필요합니다.
남은 작업은 Realtime·읽음 상태, comments/reactions/favorites persistence, moderation, 실기기 QA입니다.
결제, fulfillment, 배포, CI는 현재 MVP 범위 밖입니다.

## Supabase advisor 메모

2026-08-14 연결 프로젝트에서 advisor를 실행했습니다. 기존 migration의 trigger/helper function에
`search_path` 고정 권고가 있고, `handle_new_user`, `is_admin`, `is_admin_or_moderator`는
공개 schema의 `SECURITY DEFINER` 실행 권한 경고가 있습니다. Auth leaked-password protection도
비활성 상태입니다. 이번 UI 고도화에서는 동작 범위를 넓히지 않기 위해 schema를 임의 변경하지 않았으며,
운영 전 별도 security migration과 Auth 설정에서 반드시 해소해야 합니다.

# 개발 가이드

> 기존 Next.js·Expo·Supabase 실행 방법과 개발용 Go 세션 로그인을 설명합니다. Go API·River 기반은 [원격 실행 안내](../ops/nhn-rocky/FOUNDATION.md), 검증 범위는 [검증 결과](foundation-verification.md)를 확인합니다. 네이버·카카오 실제 연동은 보류하고 테스트 환경에서는 임시 로그인을 사용합니다.

로컬에서 SummerGear 웹앱과 모바일 쉘을 실행하고 변경을 검증합니다.
별도 안내가 없는 명령은 저장소 루트에서 실행합니다.

[문서 목차](README.md) · [아키텍처](architecture.md) · [Supabase 가이드](../supabase/README.md)

## 원격 환경으로의 전환

앞으로의 배포·서비스 테스트는 `nhn-rocky`에서, DB는 Supabase PostgreSQL을 유지하고 작업 큐는 River를 사용합니다. [배포·테스트 설계](deployment.md)를 따르며 Go 기반의 격리 테스트 명령은 [실행 안내](../ops/nhn-rocky/FOUNDATION.md)에 있습니다. 운영 배포 구성은 아직 적용하지 않았습니다. 아래 Supabase 명령은 전환 전 기존 앱에만 해당합니다.

## 준비

| 도구                  | 기준                                  |
| --------------------- | ------------------------------------- |
| Node.js               | 22.13 이상                            |
| pnpm                  | 10.34.5, 루트 `packageManager`로 고정 |
| Docker와 Supabase CLI | 로컬 백엔드를 실행할 때 필요          |

```sh
corepack enable
pnpm install
```

## 웹 실행

```sh
pnpm dev:web
```

[localhost:3000](http://localhost:3000)으로 접속합니다.
Supabase 설정이 없는 환경에서는 로컬 데모 데이터를 사용합니다.
데모 모드에서의 동작 확인과 실제 인증·RLS·Realtime 검증은 구분합니다.

Go 임시 로그인을 사용할 때는 `apps/web/.env.local`에 `SUMMERGEAR_GO_API_ORIGIN`을 설정해 Next.js의 `/api/v1` 요청을 Go API로 전달합니다. Go 쪽은 `AUTH_DEV_LOGIN_ENABLED=true`와 `PUBLIC_WEB_URL`이 필요합니다. 임시 로그인은 테스트 DB에서만 사용하며 실제 소셜 로그인을 활성화할 때 끕니다.

매물 화면은 Go API가 준비되면 `/api/v1/listings`를 우선 사용하고 기존 Supabase 공개 매물도 전환 기간 동안 함께 읽습니다. 판매 등록도 Go 세션이 있으면 Go 매물로 `pending_review` 생성하며, 현재 Go 경로에는 이미지 Storage 연동이 없으므로 사진을 선택한 등록은 명시적으로 거부합니다. 사진·서명 URL 이전 전에는 기존 Supabase 매물을 삭제하거나 직접 쓰기 권한을 차단하지 않습니다.

## 한국어·영어 화면

웹은 `next-intl`을 사용하며 기본 언어는 한국어입니다. 상단 언어 선택에서 English를 선택하면
`summergear_locale` 쿠키에 선택을 저장합니다. URL은 기존 경로를 유지하므로 로그인·결제 복귀
경로를 바꾸지 않습니다. 언어 전환은 서버 화면을 새로 요청하며 작성 중인 입력을 유지합니다.

요청별 언어 설정은 `apps/web/i18n/request.ts`, 번역 사전은 `apps/web/lib/i18n/*-messages.ts`에
있습니다. 화면에서는 `useTranslate()`로 서비스 문구를 번역하고 날짜·가격 helper에는
`useLocale()` 값을 전달합니다. 문장 전체를 번역 키로 사용하며 동적 값은 사전에서
`{count}` 같은 자리표시자로 지정합니다. 매물 설명·게시글·채팅 등 사용자 작성 내용은
번역하지 않습니다. 가격 통화는 영어 화면에서도 KRW이고 거래 시각은 서울 기준입니다.

같은 웹 주소를 사용하는 모바일 WebView에도 웹 언어 선택이 적용됩니다. 네이티브 연결 오류
화면과 기기 권한 창은 이 웹 번역 범위에 포함되지 않습니다. 실기기의 쿠키 유지·네이티브
권한·외부 결제 화면은 별도 기기/서비스 검증 대상입니다.

언어 전환·입력 유지·로그인 복귀·반응형 확인은 웹 서버 실행 후 다음으로 검사합니다.

```sh
pnpm --filter @icegear/web exec playwright test --config=playwright.config.ts e2e/language.spec.ts
```

Windows에서 `next-intl` 빌드 도구의 `ERR_SWC_NATIVE_CACHE` 오류가 발생하면 사용자 전용
권한을 가진 캐시 디렉터리를 만들고 `SWC_NATIVE_BINDING_CACHE`에 해당 경로를 지정합니다.
이번 로컬 검증은 사용자 프로필의 `.summergear-swc-cache`를 지정하여 빌드했습니다.
이는 로컬 빌드 도구 설정이며 서비스에서 요구하는 환경변수가 아닙니다.

## Supabase 연결

각 예제 파일을 아래 위치로 복사하고 프로젝트 값을 입력합니다.

| 예제 파일                                               | 로컬 설정 파일        |
| ------------------------------------------------------- | --------------------- |
| [apps/web/.env.example](../apps/web/.env.example)       | `apps/web/.env.local` |
| [apps/mobile/.env.example](../apps/mobile/.env.example) | `apps/mobile/.env`    |

웹에는 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 설정합니다.
모바일에는 `EXPO_PUBLIC_SUPABASE_URL`과 `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 설정합니다.
공개 클라이언트 설정에는 publishable key를 사용합니다.

로컬 백엔드를 쓰려면 Docker를 실행한 뒤 다음 명령을 사용합니다.

```sh
supabase start
```

로컬 데이터를 초기화해야 할 때는 `supabase db reset`을 실행합니다.
이 명령은 로컬 DB를 재생성하고 마이그레이션, `seed.sql`, `seed.demo.sql`을 순서대로 적용합니다.
기존 로컬 데이터는 삭제됩니다. 시드와 접근 정책은 [Supabase 가이드](../supabase/README.md)를 확인합니다.

## 모바일 실행

웹 서버를 켜 둔 상태에서 별도 터미널로 실행합니다.

```sh
pnpm dev:mobile
```

`EXPO_PUBLIC_WEB_URL`이 없으면 iOS는 `localhost`, Android 에뮬레이터는 `10.0.2.2`로 웹에 연결합니다.
실제 기기에서는 같은 Wi-Fi의 개발 PC 주소나 배포 URL을 지정합니다.
웹과 모바일 개발 서버를 함께 시작하려면 `pnpm dev`를 사용합니다.

## 변경 검증

| 명령                     | 확인 범위                               |
| ------------------------ | --------------------------------------- |
| `pnpm typecheck`         | 워크스페이스 TypeScript 타입            |
| `pnpm test`              | 도메인·웹·모바일 단위 테스트            |
| `pnpm lint`              | 각 패키지의 lint 스크립트               |
| `pnpm build`             | 빌드 스크립트가 있는 패키지             |
| `pnpm export:mobile:web` | Expo 웹 번들 내보내기                   |
| `pnpm format:check`      | 저장소 포맷 검사                        |
| `supabase test db`       | 실행 중인 로컬 DB의 PostgreSQL/RLS 계약 |
| `bash ops/nhn-rocky/test-listings-database.sh` | 격리 PostgreSQL에서 Go 매물 세션 소유권·RLS·등록/조회/수정 검증 |

Edge Function별 Deno 검증 명령은 [Supabase 가이드](../supabase/README.md#edge-function-검증)에 있습니다.
`pnpm format`은 저장소 전체를 수정하므로 일부 문서만 바꿀 때는 파일을 지정합니다.

```sh
pnpm exec prettier --check README.md docs/README.md docs/development.md docs/writing.md
```

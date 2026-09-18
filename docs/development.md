# 개발 가이드

> 이 문서는 현재 실행 가능한 Next.js·Expo·Supabase 환경을 설명합니다. Go 서버와 새 로그인은 구현 전이며 예정 구성은 [백엔드 전환 설계](backend-transition.md)를 확인합니다.

로컬에서 SummerGear 웹앱과 모바일 쉘을 실행하고 변경을 검증합니다.
별도 안내가 없는 명령은 저장소 루트에서 실행합니다.

[문서 목차](README.md) · [아키텍처](architecture.md) · [Supabase 가이드](../supabase/README.md)

## 원격 환경으로의 전환

앞으로의 배포·서비스 테스트는 `nhn-rocky`에서, DB는 Supabase PostgreSQL을 유지하고 작업 큐는 River를 사용합니다. [배포·테스트 설계](deployment.md)를 따르며 아직 새 환경용 실행 명령은 구현되지 않았습니다. 아래 Supabase 명령은 전환 전 기존 앱에만 해당합니다.

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

Edge Function별 Deno 검증 명령은 [Supabase 가이드](../supabase/README.md#edge-function-검증)에 있습니다.
`pnpm format`은 저장소 전체를 수정하므로 일부 문서만 바꿀 때는 파일을 지정합니다.

```sh
pnpm exec prettier --check README.md docs/README.md docs/development.md docs/writing.md
```

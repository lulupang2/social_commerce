# IceGear

IceGear는 Next.js 웹 앱과 Expo Router 모바일 앱으로 구성된 TypeScript 모노레포입니다.
현재 MVP에는 웹·모바일 중고거래 목록/상세 조회, 모바일 임시 판매글 등록, 공유 도메인 계약,
RLS가 적용된 Supabase 마이그레이션과 스포츠 시드 데이터가 포함되어 있습니다.
실제 데이터 조회와 인증된 쓰기를 사용하려면 Supabase 프로젝트와 실행 환경을 별도로 설정해야 합니다.

## 사전 요구사항

- Node.js 22.13 이상
- pnpm 10.34.5 (`packageManager` 필드로 고정)

Corepack을 활성화한 뒤 워크스페이스 의존성을 설치합니다.

```bash
corepack enable
pnpm install
```

## 환경변수

저장소에 포함된 앱별 예시 파일이 공개 Supabase 설정의 경계를 정의합니다.
로컬 복사 방법과 프로젝트 설정은 [연결된 Supabase 설정](#연결된-supabase-설정)을 참고하세요.
이 파일에는 브라우저와 모바일 번들에 공개해도 되는 값만 넣습니다.

## 개발 명령

두 앱을 별도 터미널에서 실행합니다.

```bash
pnpm dev:web
pnpm dev:mobile
```

두 개발 서버를 함께 실행할 수도 있습니다.

```bash
pnpm dev
```

검증에 사용하는 명령은 다음과 같습니다.

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm format:check
pnpm export:mobile:web
```

웹 앱은 `http://localhost:3000`에서 서버 렌더링 홈을 제공하고,
`http://localhost:3000/health`에 상태 페이지,
`http://localhost:3000/api/health`에 JSON 상태 엔드포인트를 제공합니다.
`pnpm dev:mobile`을 실행하면 Expo 개발 대상이 표시됩니다.
공개 Supabase 값이 없으면 두 클라이언트 모두 권한 있는 연결을 시도하지 않고
설정 안내 상태를 표시합니다.

## 저장소 구조

```text
apps/
  web/       Next.js App Router 웹 앱
  mobile/    Expo Router 모바일 앱
packages/
  domain/    공유 listing/profile 계약과 Zod 검증
supabase/
  migrations/  PostgreSQL 스키마와 RLS 정책
  seed.sql     결정적인 스포츠 기준 데이터
```

## 연결된 Supabase 설정

동일한 환경의 URL과 publishable key를 예시 파일에 입력합니다.

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

웹 클라이언트는 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, 모바일 클라이언트는
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 사용합니다. 웹 코드는 레거시 호환을 위해
`NEXT_PUBLIC_SUPABASE_ANON_KEY`도 별칭으로 허용합니다.
`service_role` 키, 데이터베이스 비밀번호 또는 기타 비밀값을
`NEXT_PUBLIC_`나 `EXPO_PUBLIC_` 변수에 넣지 마세요.

Supabase 프로젝트를 연결하거나 로컬 프로젝트를 설정한 뒤 migration과 seed를 적용합니다.

```bash
supabase db reset
```

시드는 ski와 hockey 스포츠 행만 생성합니다. Auth 사용자, profile, 사용자 listing은
설정된 애플리케이션 흐름을 통해 생성해야 합니다.

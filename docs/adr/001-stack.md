# ADR 001: Expo + Next.js + Supabase + pnpm 사용

- **상태:** 목표 스택으로 채택됨; MVP 기반 구현 완료
- **작성일:** 2026-08-13
- **범위:** IceGear MVP 애플리케이션과 워크스페이스 기반

## 배경

IceGear에는 모바일 클라이언트, 웹 클라이언트, 인증, 행 단위 권한이 있는 관계형 데이터,
중복 없이 계약을 공유하는 워크스페이스가 필요합니다. 현재 저장소에는 공유
`packages/domain` TypeScript/Zod 패키지와 검증 테스트, 두 클라이언트, Supabase migration/seed가 있습니다.

## 결정

MVP를 다음 pnpm workspace로 운영합니다.

- **Expo / React Native:** 모바일 애플리케이션
- **Next.js:** 웹 애플리케이션과 웹/서버 경계
- **Supabase:** RLS가 적용된 Auth와 Postgres. 검토된 요구사항이 있을 때만 Storage 또는 Edge Function 사용
- **pnpm:** workspace 의존성과 공통 스크립트 관리

기존 `packages/domain`을 스키마, API 계약, 안전한 도메인 타입의 기본 위치로 유지합니다.
이동이 필요하면 별도 ADR을 먼저 작성합니다. 플랫폼 표현 코드는 해당 앱에 둡니다.
단순한 RLS 보호 작업에는 Supabase 공개 client를 사용하고, 권한/다단계 작업에는 신뢰된
Next.js route 또는 Supabase Edge Function을 사용합니다. 작업별 전송 방식은 후속 결정입니다.

## MVP에 적합한 이유

- Expo는 초기 모바일 대상에 하나의 React Native 코드베이스를 제공하면서 native escape hatch를 남깁니다.
- Next.js는 별도 웹 backend 없이 웹 앱과 서버 실행 경계를 함께 제공합니다.
- Supabase는 관리형 Postgres/Auth를 제공하고, 데이터베이스 권한(RLS)을 애플리케이션 경계의 일부로 만듭니다.
- pnpm workspace는 모바일/웹 계약과 검증 로직을 같은 버전으로 유지하기 쉽습니다.
- 작은 팀이 카탈로그 조회, 계정 데이터, 사용자 소유 listing을 먼저 만들고 결제 복잡도는 나중에 추가할 수 있습니다.

## 결과

### 장점

- 모바일과 웹이 하나의 관계형 source of truth를 공유합니다.
- 공유 계약 패키지로 클라이언트 간 모델 drift를 줄일 수 있습니다.
- 올바르게 작성·검증한 RLS가 direct client data access를 보호합니다.
- secret과 권한 작업을 처리할 서버 경계가 있습니다.
- 제품 결정 전까지 결제, 검색 인프라, queue, seller 운영 기능을 미룰 수 있습니다.

### 비용과 위험

- Expo, Next.js, Supabase는 서로 다른 실행/빌드 규칙을 가지므로 환경 처리가 명시적이어야 합니다.
- Supabase RLS는 강력하지만 잘못 설정하기 쉬워 모든 테이블의 정책 테스트가 필요합니다.
- direct Supabase 호출과 Next.js/Edge API가 drift하지 않도록 전송 경계를 공유 계약에 기록해야 합니다.
- 모바일 Auth persistence와 deep link에는 플랫폼별 설정이 필요합니다.
- 운영 전에 hosted Supabase, 웹 배포 비용, 지역 가용성, 운영 주체를 검토해야 합니다.

## 보안 영향

- 공개 Supabase 설정만 browser/Expo bundle에 포함합니다.
- service-role key와 database credential은 서버/CI 전용입니다.
- 모든 애플리케이션 테이블에 default-deny RLS 정책을 적용합니다.
- operator write는 명시적인 role과 감사 가능한 서버 경로를 사용합니다.
- public response는 안전한 projection을 사용하며, service role이 볼 수 있다는 이유만으로 private 필드를 공개하지 않습니다.

## 검토한 대안

### 별도 native 앱 또는 React Native CLI

더 직접적인 native 제어가 가능하지만 제품 범위를 검증하기 전에 설정과 유지보수 비용이 늘어납니다.
Expo 제약이 확정 요구사항을 막을 때 다시 검토합니다.

### Next.js만 사용

모바일 클라이언트 요구사항을 충족하지 못하고 모바일이 나중에 별도 제품으로 갈라질 위험이 있습니다.

### Custom API + 관리형 database/auth provider

backend 제어력은 높지만 현재 MVP에 필요한 범위보다 인프라와 운영 부담이 큽니다.
API 경계, 부하, compliance 요구사항이 Supabase를 넘어설 때 다시 검토합니다.

### npm/Yarn workspace

workspace를 관리할 수 있지만 이 제품의 package manager는 pnpm으로 결정했으므로 lockfile 소유자를 하나로 유지합니다.

## 후속 결정

1. `packages/domain`을 root workspace에 포함하고 Node, pnpm, Expo, Next.js, Supabase CLI 버전을 고정합니다.
2. 작업별 direct Supabase, Next.js route, Edge Function 경계를 결정합니다.
3. Auth provider, callback/deep-link scheme, 환경/hosting을 결정합니다.
4. media, social content, seller listing, commerce 중 MVP 범위를 확정합니다.
5. 애플리케이션 release 전에 migration, RLS policy test, CI check, secret scanning을 추가합니다.

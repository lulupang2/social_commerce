# SummerGear

> 다음 단계: Go + Fiber 백엔드와 네이버·카카오 자체 인증, 입점사 거래로 확장합니다. 현재는 설계 단계이며 아래 실행 방법은 기존 앱 기준입니다. [전환 계획](docs/backend-transition.md) · [인증 설계](docs/authentication.md) · [로드맵](docs/plan.md)

서핑과 테니스를 위한 중고 장비 거래·커뮤니티.
Next.js 웹앱과 Expo WebView 앱이 화면과 도메인 계약을 공유합니다.

[시작하기](docs/development.md) · [문서 둘러보기](docs/README.md) · [제품 기준](docs/SSOT.md) · [아키텍처](docs/architecture.md)

배포·서버 테스트는 `nhn-rocky`, DB는 Supabase PostgreSQL, 작업 큐는 River, PG는 토스페이먼츠 테스트 환경입니다. [원격 환경 설계](docs/deployment.md) · [River 설계](docs/background-jobs.md) · [테스트 결제 준비](docs/payment-test-setup.md)

## 빠른 시작

Node.js 22.13 이상과 pnpm 10.34.5가 필요합니다.

```sh
corepack enable
pnpm install
pnpm dev:web
```

[localhost:3000](http://localhost:3000)에서 웹앱을 확인합니다.
Supabase 설정이 없는 환경에서는 로컬 데모 데이터를 사용합니다.
실제 데이터 연결과 모바일 실행은 [개발 가이드](docs/development.md)를 따릅니다.

## 제품 구성

| 영역        | 주요 흐름                                      |
| ----------- | ---------------------------------------------- |
| 장비 거래   | 종목별 탐색, 상세 스펙, 찜, 단계별 판매 등록   |
| 커뮤니티    | 장비 후기, 스팟 정보, 모임 모집, 댓글과 좋아요 |
| 거래 채팅   | 1:1 메시지, Realtime 수신, 읽음 처리           |
| 모바일 연동 | 사진 선택, 햅틱, 푸시 토큰, 오프라인 재시도    |

## 코드 탐색

| 경로                               | 역할                                        |
| ---------------------------------- | ------------------------------------------- |
| [apps/web](apps/web)               | Next.js App Router 기반 사용자 화면         |
| [apps/mobile](apps/mobile)         | Expo / React Native WebView와 네이티브 기능 |
| [packages/domain](packages/domain) | 공유 TypeScript 모델과 Zod 검증             |
| [supabase](supabase)               | 데이터베이스, RLS, Storage, Edge Functions  |

패키지 이름은 기존 `@icegear/*` 네임스페이스를 사용합니다.

## 변경 검증

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

모바일 번들·DB·Edge Function 검증은 [개발 가이드](docs/development.md#변경-검증)를 확인합니다.
문서를 수정할 때는 [작성 규칙](docs/writing.md)을 따릅니다.

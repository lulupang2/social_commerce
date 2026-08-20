# SummerGear (썸머기어) 🏄‍♂️🎾

SummerGear는 서핑(Surf)과 테니스(Tennis)를 위한 하계 스포츠 버티컬 중고거래 & 커뮤니티 플랫폼입니다.  
모바일 퍼스트 반응형 **Next.js Web App**과 고성능 **Expo/React Native WebView Shell**로 구성된 TypeScript 모노레포입니다.

---

## 🌟 주요 특징 및 기능

- **하계 스포츠 버티컬 스펙 모델링 (`@icegear/domain`)**
  - **서핑(Surf):** 숏보드 · 롱보드 · 펀보드, 보드 길이(ft), 부력 Volume(L), 핀 시스템(FCS II / Futures), 웻슈트 두께(2mm, 3/2mm 등)
  - **테니스(Tennis):** 라켓 헤드 사이즈(sq.in), 무게(g), 그립 사이즈(G1~G3), 플레이 스타일(올코트/베이스라인/서브앤발리), 스트링 작업 여부
- **모바일 퍼스트 반응형 웹 (`apps/web`)**
  - 청량한 오션 블루 & 썬 오렌지 테마의 모바일 레이아웃 쉘 및 상단/하단 고정 네비게이션
  - **홈 (`/`):** 맞춤 추천 레일, 종목별 필터(🏄‍♂️ 서핑 / 🎾 테니스), 2열 그리드 상품 피드
  - **마켓 & 상세 (`/market`, `/market/[id]`):** 장비 상세 스펙 뱃지 그리드, 판매자 매너온도, 찜 & 1:1 거래 채팅 CTA
  - **단계별 판매 등록 (`/sell`):** 종목 선택 -> 기본 정보 -> 종목별 정밀 스펙 입력 -> 가격 설정
  - **커뮤니티 라운지 (`/community`):** 파도 예보/스팟 공유, 테니스 라켓 시타기, 번개 모임 모집 및 댓글/좋아요
  - **실시간 채팅 (`/chats`, `/chat/[id]`):** 상단 거래 상품 정보 바, 1:1 메시지 송수신, 안전거래 안내
  - **프로필 & 온보딩 (`/profile`, `/auth`):** 내 서핑/테니스 구력 및 선호 장비 설정 관리
- **고성능 모바일 웹뷰 쉘 (`apps/mobile`)**
  - `react-native-webview` 기반의 네이티브 래퍼
  - 디바이스 Safe Area 인셋 자동 처리, 제스처 및 안드로이드 뒤로가기(BackHandler) 완벽 지원
  - Pull-to-refresh 제스처 및 네트워크 오프라인 대응 화면
- **견고한 데이터 & 보안 계약**
  - RLS(Row Level Security)가 적용된 PostgreSQL/Supabase 마이그레이션
  - 서핑 및 테니스 결정적 시드 데이터 (`supabase/seed.demo.sql`)

---

## 📁 저장소 구조

```text
apps/
  web/          Next.js App Router 기반 모바일 퍼스트 웹 앱
  mobile/       Expo / React Native 기반 WebView 쉘 앱
packages/
  domain/       서핑·테니스 도메인 모델 및 Zod 런타임 유효성 검증
supabase/
  migrations/   PostgreSQL 스키마 및 RLS 보안 정책
  seed.sql      기준 스포츠 데이터 (surf, tennis)
  seed.demo.sql 서핑·테니스 시연용 데모 장비 및 프로필 데이터
```

---

## 🛠️ 사전 요구사항

- **Node.js**: 22.13 이상
- **pnpm**: 10.34.5 (`packageManager` 필드로 고정)

Corepack을 활성화한 뒤 워크스페이스 의존성을 설치합니다:

```bash
corepack enable
pnpm install
```

---

## 🚀 개발 및 실행 명령

### 1. 개발 서버 실행

```bash
# Next.js 웹앱 실행 (http://localhost:3000)
pnpm dev:web

# Expo 모바일 웹뷰 쉘 실행
pnpm dev:mobile

# 전체 개발 서버 동시 실행
pnpm dev
```

> **Tip**: 브라우저에서 `http://localhost:3000` 접속 후 개발자 도구(F12)의 디바이스 툴바(모바일 뷰)를 켜면 최적화된 앱 UI를 확인할 수 있습니다.

### 2. 검증 및 빌드 명령

```bash
pnpm typecheck        # 전체 워크스페이스 TypeScript 타입 검사
pnpm test             # 도메인, 웹, 모바일 전체 단위 테스트 실행
pnpm lint             # ESLint 정적 분석
pnpm build            # Next.js 및 도메인 프로덕션 빌드
pnpm format           # Prettier 코드 포맷팅
pnpm export:mobile:web # 모바일 웹 번들 빌드
```

---

## 🗄️ 환경변수 및 Supabase 설정

각 앱 디렉터리의 `.env.example`을 복사하여 로컬 환경변수를 설정합니다:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

### 주요 환경변수

- `apps/web`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `apps/mobile`: `EXPO_PUBLIC_WEB_URL` (기본값: `http://localhost:3000`), `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

### 로컬 Supabase 데이터베이스 초기화

```bash
supabase db reset
```

기본 시드 적용 후 `supabase/seed.demo.sql`을 실행하면 서핑보드(Happy Everyday, Torq Mod Fun) 및 테니스 라켓(Pro Staff 97, Pure Aero) 등의 풍부한 데모 데이터를 즉시 확인할 수 있습니다.

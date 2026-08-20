# SummerGear MVP 아키텍처

**상태:** 하계 스포츠(서핑·테니스) 및 Next.js + React Native WebView Shell 아키텍처 구현 완료.

---

## 1. 시스템 컨텍스트 다이어그램

```text
┌─────────────────────────────────────────────────────────┐
│                    User Devices                         │
│  ┌───────────────────────┐   ┌────────────────────────┐ │
│  │   Mobile App (Expo)   │   │  Web Browsers (Mobile/ │ │
│  │   - WebView Shell     │   │  Desktop Responsive)   │ │
│  │   - Safe Area Insets  │   │                        │ │
│  │   - Native Bridges    │   │                        │ │
│  └───────────┬───────────┘   └───────────┬────────────┘ │
└──────────────┼───────────────────────────┼──────────────┘
               │ (HTTP / WebSocket)        │
               ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Next.js Web App                       │
│                     (apps/web)                          │
│  - App Router (SSR & Client Components)                 │
│  - SummerGear Mobile Layout Shell                       │
│  - Route Handlers (/api/health, etc.)                   │
│  - Shared Domain Contracts (@icegear/domain)            │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Supabase Backend                      │
│  - PostgreSQL (Surf & Tennis Domain Tables)             │
│  - Row Level Security (RLS) Access Policies             │
│  - Supabase Auth (Email OTP / Session Management)       │
│  - Storage (Private listing-images bucket + Signed URLs)│
│  - Realtime (Chat & Notification Channels)              │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 컴포넌트별 책임

### Next.js 웹 애플리케이션 (`apps/web`)
- **모바일 퍼스트 반응형 UI 제공:** 
  - 홈 (`/`), 마켓 둘러보기/상세 (`/market`, `/market/[id]`), 판매 등록 플로우 (`/sell`)
  - 커뮤니티 라운지 (`/community`, `[id]`, `create`), 실시간 채팅 (`/chats`, `/chat/[id]`), 프로필 (`/profile`, `/auth`)
- **디자인 시스템 및 레이아웃:** 
  - 오션 블루/썬 오렌지 컬러 팔레트, 하단 고정 탭 네비게이션, 상단 앱 헤더
- **도메인 계약 연동:** `@icegear/domain`의 서핑/테니스 Zod 스키마 및 유효성 검사 적용

### Expo 모바일 웹뷰 쉘 (`apps/mobile`)
- **네이티브 래퍼 컨테이너:** `react-native-webview`를 통해 웹앱 렌더링
- **디바이스 하드웨어 연동:**
  - `react-native-safe-area-context`를 통한 상단 노치/하단 홈바 인셋 자동 반영
  - 안드로이드 물리 뒤로가기 버튼(`BackHandler`)과 웹뷰 탐색 히스토리 연동
  - 상태바 스타일(`expo-status-bar`) 최적화
  - Pull-to-refresh 및 네트워크 단절 시 오프라인 재시도 뷰 제공
- **URL 동적 전환:** `EXPO_PUBLIC_WEB_URL` 환경변수를 통한 로컬/스테이징/프로덕션 웹앱 연결 지원

### 도메인 계약 패키지 (`packages/domain`)
- **서핑 (`surf`) 스키마:** 숏보드, 롱보드, 펀보드, 웻슈트, 핀, 리시 등 사양 검증
- **테니스 (`tennis`) 스키마:** 라켓 헤드사이즈, 무게, 그립, 플레이스타일, 신발, 가방 등 사양 검증
- **추천 규칙 엔진:** 사용자 구력, 사이즈, 종목 선호에 기반한 결정론적 맞춤 추천 알고리즘

### Supabase 백엔드 (`supabase/`)
- **데이터베이스:** PostgreSQL 스키마 및 RLS(Row Level Security) 접근 제어
- **보안 스토리지:** `listing-images` 비공개 버킷 및 10분 만료 서명된 URL(Signed URL) 제공
- **인증:** Supabase Auth (Email OTP) 기반 안전한 세션 관리
- **시드 데이터:** 결정론적 하계 스포츠 기준 데이터 및 데모 시드 (`seed.demo.sql`)

---

## 3. 핵심 데이터 및 요청 흐름

1. **마켓 둘러보기 & 상세 조회:**
   - 클라이언트 -> Supabase PostgreSQL (RLS에 의해 `status = 'active'` 매물만 안전하게 조회)
   - 이미지 요청 시 만료 시간이 부여된 Signed URL 프로젝션 사용
2. **판매글 작성:**
   - 사용자 인증 세션(`auth.uid()`) 확인 -> 서핑/테니스 도메인 Zod 스키마 검증 -> `draft` 상태로 생성 -> 검토 요청(`pending_review`)
3. **커뮤니티 및 1:1 채팅:**
   - 파도 예보/시타기 등 정보 공유 -> 댓글 및 1인 1좋아요(Like) 반영
   - 구매자와 판매자 간 거래 문의 채팅 채널 생성 및 메시지 전송

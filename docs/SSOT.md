# SummerGear MVP 단일 기준 문서 (SSOT)

**상태:** 하계 스포츠(서핑·테니스) 전환 및 완전 웹뷰 기반 모바일 퍼스트 아키텍처 전환 완료. Next.js 웹앱(`apps/web`), WebView 쉘(`apps/mobile`), 도메인 계약(`packages/domain`), 결정론적 데모 시드(`supabase/seed.demo.sql`) 및 통합 검증 완료.

**최종 검토일:** 2026-08-20

이 문서는 SummerGear MVP의 단일 기준(Single Source of Truth)입니다. 확정된 사실, 아키텍처 설계, 보안 경계 및 도메인 계약을 정의합니다.

---

## 1. 제품 정의와 범위

### 확정 사항
- **제품명:** SummerGear (썸머기어)
- **도메인 영역:** 하계 스포츠(서핑 `surf`, 테니스 `tennis`) 버티컬 C2C 중고거래 및 커뮤니티
- **아키텍처 스택:** 
  - **웹 클라이언트 (`apps/web`):** Next.js 16 (App Router), Tailwind CSS, Lucide Icons 기반 완전 반응형 모바일 퍼스트 웹앱
  - **모바일 클라이언트 (`apps/mobile`):** Expo Router / React Native 기반 고성능 WebView 쉘 (Safe Area, BackHandler, Pull-to-refresh)
  - **공유 도메인 (`packages/domain`):** 서핑·테니스 스키마, Zod 런타임 유효성 검증, 추천 규칙
  - **백엔드/인프라:** Supabase (PostgreSQL, RLS 보안 정책, Storage, Realtime)
  - **패키지 매니저:** pnpm 10.34.5 워크스페이스

### 핵심 도메인 스펙
1. **서핑 (`surf`):**
   - 세부 카테고리: 숏보드(`shortboard`), 롱보드(`longboard`), 펀보드(`funboard`), 웻슈트(`wetsuit`), 핀(`fin`), 기타 악세서리
   - 주요 스펙: 보드 길이(`boardLengthFeet`), 부력 부피(`volumeLiters`), 핀 시스템(`finSystem`: FCS II, Futures), 웻슈트 두께(`thicknessMm`)
2. **테니스 (`tennis`):**
   - 세부 카테고리: 라켓(`racket`), 가방(`bag`), 신발(`shoes`), 의류(`apparel`), 악세서리(`accessories`)
   - 주요 스펙: 헤드 사이즈(`headSizeSqIn`), 무게(`weightGrams`), 그립 사이즈(`gripSize`: G1~G3), 플레이 스타일(`playStyle`), 스트링 작업 여부(`strung`)

---

## 2. 모바일 퍼스트 & 웹뷰 아키텍처 원칙

1. **단일 UI 소스 오브 트루스:**
   - 모든 사용자 마주침 화면(홈, 마켓 탐색/상세, 판매 등록, 커뮤니티 라운지, 1:1 채팅, 프로필)은 `apps/web`에 구축됩니다.
2. **네이티브 웹뷰 쉘 연동 (`apps/mobile`):**
   - `react-native-webview`를 통해 웹앱을 래핑하며 디바이스의 Safe Area Inset(상/하단 노치 및 홈바)을 네이티브 레이어에서 처리합니다.
   - 안드로이드 하드웨어 뒤로가기(`BackHandler`) 및 웹뷰 히스토리 네비게이션을 동기화합니다.
   - 네트워크 단절 시 친절한 오프라인 재시도 뷰를 제공합니다.
3. **규칙 기반 맞춤 추천:**
   - 사용자 프로필의 선호 종목, 구력/스킬 레벨, 신체/사이즈 스펙과 매물 스펙을 비교하는 결정론적 규칙 엔진을 제공합니다.
   - 규칙 기반 결과는 `맞춤 추천` 또는 `추천 이유`로 표기합니다.

---

## 3. 보안 및 RLS 원칙

1. **Default Deny:** 모든 PostgreSQL 테이블에 RLS를 활성화하고 문서화된 정책만 허용합니다.
2. **Database Subject 강제:** 데이터 소유권은 클라이언트 파라미터가 아닌 `auth.uid()`를 기준으로 합니다.
3. **공개 데이터 최소화:** `active` 상태의 listing 및 승인된 community 글만 익명/공개 읽기가 가능합니다.
4. **Private Storage & Signed URL:** `listing-images` 버킷은 private으로 유지하며, 최대 10분 유효기간의 signed URL만 클라이언트에 전달합니다.
5. **감사 가능한 상태 전이:** 판매글 및 커뮤니티 글은 일반 사용자가 `draft`로 생성하며, 검토/승인 경계를 통해 `active`로 전이됩니다.

---

## 4. 환경변수 계약

| 변수명 | 위치 | 설명 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `apps/web` | Supabase 공개 anon/publishable key |
| `EXPO_PUBLIC_WEB_URL` | `apps/mobile` | 모바일 웹뷰가 연결할 웹앱 URL (기본값: `http://localhost:3000`) |
| `EXPO_PUBLIC_SUPABASE_URL` | `apps/mobile` | 모바일 클라이언트용 Supabase URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `apps/mobile` | 모바일 클라이언트용 Supabase 공개 key |

---

## 5. 검증 및 품질 기준

- `pnpm typecheck`: 워크스페이스 전 패키지(domain, web, mobile) TypeScript 무결성 검증
- `pnpm test`: 도메인 계약, 웹 리포지토리, 모바일 웹뷰 헬퍼 단위 테스트 100% 통과
- `pnpm lint`: 코드 정적 분석 및 ESLint 검증
- `pnpm build`: Next.js 최적화 프로덕션 빌드 성공
- `pnpm export:mobile:web`: 모바일 웹 번들 빌드 성공

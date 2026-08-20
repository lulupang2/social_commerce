# ADR 001: SummerGear 하계 스포츠 및 모바일 퍼스트 Next.js + WebView 스택 선정

- **상태:** 채택 및 구현 완료 (Accepted & Implemented)
- **작성일:** 2026-08-20
- **범위:** SummerGear MVP 모노레포 아키텍처

---

## 배경

SummerGear는 서핑(Surf)과 테니스(Tennis)를 전문으로 하는 하계 스포츠 C2C 중고거래 및 커뮤니티 플랫폼입니다.  
빠른 프로덕트 이터레이션과 웹·앱 단일 코드베이스의 이점을 극대화하기 위해, Next.js 모바일 퍼스트 웹앱을 중심으로 구축하고 Expo 모바일 앱을 네이티브 WebView 쉘로 활용하는 아키텍처를 채택했습니다.

---

## 결정된 기술 스택

1. **Next.js 16 (App Router):** 모바일 퍼스트 반응형 웹 클라이언트 및 SSR 렌더링 (`apps/web`)
2. **Expo / React Native WebView Shell:** 네이티브 디바이스 Safe Area, 뒤로가기, 제스처를 지원하는 모바일 래퍼 (`apps/mobile`)
3. **TypeScript & Zod (`packages/domain`):** 서핑 및 테니스 도메인 모델, 스키마, 런타임 유효성 검증
4. **Supabase (PostgreSQL, RLS, Storage):** 관계형 데이터베이스 및 행 단위 보안 정책
5. **pnpm Workspace:** 모노레포 의존성 및 공통 스크립트 관리

---

## 기대 효과

- **단일 UI 개발 생산성:** 화면 수정 및 신규 기능 추가 시 Next.js 코드 한 곳만 수정하면 웹과 앱에 즉시 동시 반영됨
- **네이티브 경험 보장:** Safe Area 인셋 및 안드로이드 뒤로가기 제어 등을 네이티브 레이어에서 완벽하게 제어
- **도메인 무결성:** 서핑보드 부력/핀 시스템, 테니스 라켓 헤드사이즈/무게 등 정밀 스펙을 Zod 스키마로 철저히 보호

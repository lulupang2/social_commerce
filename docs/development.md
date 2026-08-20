# SummerGear 개발 가이드

이 문서는 SummerGear 프로젝트의 로컬 개발 환경 구성, 스크립트 실행 및 테스트 절차를 설명합니다.

---

## 1. 워크스페이스 개요

- **패키지 매니저:** pnpm 10.34.5 (Corepack 지원)
- **Node.js:** 22.13 이상 권장
- **구조:**
  - `apps/web`: Next.js 16 (App Router) 모바일 퍼스트 웹앱
  - `apps/mobile`: Expo Router / React Native WebView 쉘
  - `packages/domain`: 공유 도메인 계약 및 Zod 스키마
  - `supabase/`: PostgreSQL 마이그레이션 및 하계 스포츠 시드 데이터

---

## 2. 개발 서버 실행

```bash
# 의존성 설치
pnpm install

# Next.js 웹앱 실행 (http://localhost:3000)
pnpm dev:web

# Expo 모바일 앱 실행
pnpm dev:mobile

# 전체 개발 서버 동시 실행
pnpm dev
```

---

## 3. 품질 검증 스크립트

```bash
# 워크스페이스 전체 TypeScript 검증
pnpm typecheck

# 도메인, 웹, 모바일 전체 단위 테스트 실행
pnpm test

# ESLint 정적 분석
pnpm lint

# Next.js 프로덕션 빌드
pnpm build

# Prettier 포맷팅
pnpm format
pnpm format:check

# 모바일 웹 번들 빌드
pnpm export:mobile:web
```

---

## 4. 로컬 Supabase 개발

```bash
# 로컬 Supabase 컨테이너 시작
supabase start

# 마이그레이션 및 스키마 리셋
supabase db reset

# 하계 스포츠 데모 시드 데이터 적용
supabase db execute -f supabase/seed.demo.sql
```

# SummerGear 문서

프로젝트를 실행하고, 구조를 이해하고, 변경할 때 필요한 문서입니다.

## 시작하기

| 하고 싶은 일              | 읽을 문서                         |
| ------------------------- | --------------------------------- |
| 로컬에서 웹·앱 실행하기   | [개발 가이드](development.md)     |
| 제품 범위와 원칙 확인하기 | [제품 기준 · SSOT](SSOT.md)       |
| 화면과 문구 설계하기      | [모바일 UI 가이드](mobile-mvp.md) |

## 구조와 계약

| 확인할 내용             | 읽을 문서                                     |
| ----------------------- | --------------------------------------------- |
| 웹·모바일·백엔드의 책임 | [아키텍처](architecture.md)                   |
| 데이터 구조와 관계      | [데이터 모델](data-model.md)                  |
| 요청·응답과 브릿지 계약 | [API 계약](api-contracts.md)                  |
| DB 운영, RLS, 함수 검증 | [Supabase 가이드](../supabase/README.md)      |
| 공유 스키마             | [도메인 패키지](../packages/domain/README.md) |

## Go 백엔드와 입점사 확장

현재 구현과 분리한 설계 문서입니다. 구현 상태와 완료 조건은 로드맵에서 관리합니다.

| 목적                          | 문서                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------- |
| 목표 구성·기존 기능 이전·복구 | [백엔드 전환 설계](backend-transition.md)                                     |
| 네이버·카카오·세션·회원 연결  | [인증 설계](authentication.md)                                                |
| 업체·재고·주문·결제·정산      | [입점사와 거래 설계](commerce.md)                                             |
| 확정된 기술 방향과 선택 이유  | [ADR 003 · Go 백엔드와 자체 소셜 인증](adr/003-go-backend-and-social-auth.md) |

## 배포와 작업 큐

- [nhn-rocky 배포·테스트](deployment.md): Supabase 연결, 환경 격리와 백업·복구.
- [River 작업 설계](background-jobs.md): Supabase에 작업 저장, 실행·재시도·권한.
- [ADR 004 · 이전 환경 결정](adr/004-nhn-rocky-docker-postgres.md): Docker 운영 DB 계획은 ADR 005로 대체.
- [ADR 005 · 최종 DB·큐·PG 결정](adr/005-supabase-river-toss-test.md): Supabase 유지, River, 토스페이먼츠 테스트.
- [테스트 결제 준비](payment-test-setup.md): 사용자 준비와 구현 요청에 필요한 정보.

## 계획과 결정

- [로드맵](plan.md): 단계별 작업 현황. 완료 표시는 해당 작업의 기록이며 현재 검증 결과와는 구분합니다.
- [ADR 001 · 기술 스택](adr/001-stack.md): Next.js와 Expo WebView를 선택한 배경.
- [ADR 002 · 보안과 도메인 경계](adr/002-mobile-mvp-safety-boundaries.md): 접근 제어와 제품 표기 원칙.
- [문서 작성 규칙](writing.md): 문서의 역할, 구성, 변경 시 확인할 사항.

처음 합류했다면 **개발 가이드 → 제품 기준 → 아키텍처** 순서로 읽습니다.

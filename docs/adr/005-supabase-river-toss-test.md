# ADR 005: Supabase DB 유지, River와 토스페이먼츠 테스트 연동

- 상태: 채택, 구현 전
- 결정일: 2026-09-18
- 대체 범위: [ADR 004](004-nhn-rocky-docker-postgres.md)의 Docker 운영 DB·마이그레이션 위치와 작업 큐 미선정 방침

## 결정

1. DB는 기존 Supabase PostgreSQL을 유지합니다. 운영 DB를 nhn-rocky의 Docker로 옮기지 않습니다.
2. 백엔드·인증은 기존 결정대로 Go + Fiber가 담당합니다. DB 유지가 Supabase Auth 유지로의 변경을 의미하지 않습니다. 네이버·카카오 로그인과 서비스 세션은 Go에서 처리합니다.
3. 백그라운드 작업 큐는 River를 채택합니다. API와 별도 Go worker가 Supabase PostgreSQL을 공유하고 업무 변경·작업 등록을 같은 트랜잭션에 기록합니다. BullMQ·Redis는 도입하지 않습니다.
4. PG는 토스페이먼츠 테스트 환경으로 연습·검증합니다. 토스페이는 간편결제 수단이며 PG 연동 범위는 토스페이먼츠로 정의합니다. 실제 결제와 판매자 실지급은 이번 범위에서 제외합니다.
5. 서비스 배포·서버 테스트는 nhn-rocky에서 수행합니다. 테스트 데이터와 큐는 운영에서 격리합니다.
6. 앱 스키마는 기존 `supabase/migrations`에 추가합니다. River 라이브러리 스키마는 고정 버전의 공식 migration 절차를 배포 단계에서 별도로 실행·추적합니다. 과거 앱 migration 파일을 재작성하지 않습니다.

## 초기 완료 목표

nhn-rocky의 테스트 앱에서 로그인한 사용자가 서버에서 계산한 주문을 만들고 토스페이먼츠 테스트 승인·조회·취소를 수행합니다. River는 미결제 예약 만료와 승인 결과 대조를 처리합니다. 중복 요청·금액 변조·worker 재시작·PG 응답 유실을 검증합니다.

## 관련 문서

- [배포·테스트](../deployment.md)
- [River 작업 설계](../background-jobs.md)
- [테스트 결제 준비](../payment-test-setup.md)

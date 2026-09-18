# River 백그라운드 작업 설계

상태: River 채택, 구현 전 · 기준일: 2026-09-18

[ADR 005](adr/005-supabase-river-toss-test.md)에 따라 Go + Fiber와 Supabase PostgreSQL에 River를 사용합니다. BullMQ·Redis는 도입하지 않습니다. Go API와 worker는 nhn-rocky에서 별도 프로세스로 실행합니다.

## 초기 작업

| 작업           | 실행 조건·책임                                                  |
| -------------- | --------------------------------------------------------------- |
| 주문 예약 만료 | 만료 시점에 주문·결제 상태를 재확인하고 조건부로 재고 해제      |
| 결제 결과 대조 | PG 응답 유실·승인 결과 미반영 시 토스페이먼츠 조회 후 상태 복구 |
| 알림 전송      | 주문·배송 처리 이후 테스트 수신처로 전송, 실패 시 재시도        |
| 정산·지급      | 후속 확장. 이번 테스트 결제 범위에서 실제 지급하지 않음         |

로그인·상품 조회와 일반 결제 승인은 HTTP API에서 처리합니다. River는 후속·예약·복구 작업을 맡습니다. 승인 대기 상태를 성공으로 표시하지 않습니다.

## 데이터와 실행 구조

업무 데이터 변경과 River 작업 등록을 같은 PostgreSQL 트랜잭션으로 저장합니다. 주문 생성 rollback 시 예약 만료 작업도 취소됩니다. API에서는 insert-only 클라이언트를 사용하고 worker에서 작업 실행을 시작합니다. [River 트랜잭션 등록](https://riverqueue.com/docs/transactional-enqueueing)

```text
nhn-rocky Go API → Supabase PostgreSQL (주문 + River 작업)
nhn-rocky Go worker ← 실행 시점에 작업 가져오기
Go worker → 토스페이먼츠 테스트 조회 → DB 상태 반영
```

예정 경로는 `apps/api/cmd/api`, `apps/api/cmd/worker`, `apps/api/internal/jobs`입니다. worker는 기존 주문·결제 서비스 함수를 호출하고 규칙을 중복 구현하지 않습니다. 동일 DB 작업을 위한 outbox를 River와 중복 생성하지 않습니다. 외부 전달·별도 감사 요구가 있는 경우에만 outbox를 추가합니다.

## 연결·권한·migration

worker coordinator는 `LISTEN/NOTIFY`를 지원하는 direct 또는 session-pooling 연결을 사용합니다. transaction pooler만 설정하고 정상 동작한다고 가정하지 않습니다. Supabase 연결 수와 API·worker 풀의 합계를 검증합니다. [River PgBouncer 가이드](https://riverqueue.com/docs/pgbouncer)

River 버전과 드라이버를 고정하고 공식 migration을 별도 배포 단계에서 적용합니다. 앱 SQL은 `supabase/migrations`에서 관리하며 적용 순서와 권한을 기록합니다. 큐 스키마의 공개 API 노출과 브라우저 역할 접근을 차단합니다.

테스트는 전용 Supabase 프로젝트를 사용합니다. worker는 운영 PG 키·운영 주문에 접근하지 않습니다. nhn-rocky 자원을 고려해 작은 동시성으로 시작하고 작업 지연·재시도·DB 연결·메모리를 측정합니다.

## 실패와 중복 처리

- 작업은 재실행될 수 있습니다. PG 승인·환불·지급에는 업무 멱등 키와 결과 조회를 별도로 적용합니다.
- 예약 만료는 승인 확인 중인 주문을 무조건 취소하지 않고 현재 상태를 확인합니다.
- 외부 호출 성공 뒤 DB 기록 실패는 PG 조회로 복구합니다. 같은 작업을 다시 받았다고 외부 효과를 새로 만들지 않습니다.
- 재시도 횟수·지연·최종 실패 보관·수동 재처리와 작업 지연 알림을 구현합니다.
- 작업 payload에는 식별자와 최소 정보만 저장하고 비밀키·토큰·불필요한 개인정보를 넣지 않습니다.
- 작업 스키마 변경 시 이전 버전 payload를 처리할 수 있도록 버전과 호환 기간을 관리합니다.

## 완료 조건

같은 트랜잭션의 rollback, 중복 등록·실행, worker 강제 종료·복귀, DB 연결 단절, PG 성공 후 DB 실패를 nhn-rocky 테스트 환경에서 검증합니다. River 설치·연결·작업 테스트는 아직 수행하지 않았습니다.

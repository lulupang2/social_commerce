SummerGear에 주문·재고 예약·토스페이먼츠 테스트 결제 기반을 구현해줘.

이것은 이미 한 세션에서 시작했던 구현의 연속이야. 이전 세션에서의 진행 상황을 아래에 정리했으니, 그 상태를 복원하고 이어서 작업해.

---

## 1. 기존 세션에서 완료된 것

### DB Migration (3개 생성)
- `supabase/migrations/0011_sellers.sql` — sellers, seller_memberships 테이블 + RLS
- `supabase/migrations/0012_orders.sql` — orders, order_items, inventory_reservations, inventory_items + RLS
- `supabase/migrations/0013_payments.sql` — payment_attempts, refunds, payment_events + RLS
- `apps/api/internal/migrate/chain.go` 수정 — manifest에 0011~0013 추가

### Go 백엔드 파일들 (생성 완료)
- `apps/api/internal/orders/model.go` — Seller, Order, OrderItem, PaymentAttempt, Reservation 등 도메인 모델 + exported error들 (ErrInvalid, ErrNotFound 등)
- `apps/api/internal/orders/store.go` — CreateOrder(주문+예약 단일 트랜잭션), GetOrder, ListBuyerOrders, CancelOrder
- `apps/api/internal/orders/store_extra.go` — CreatePaymentAttempt, UpdatePaymentApprove, ListPendingPaymentOrders
- `apps/api/internal/orders/http.go` — POST/GET /api/v1/orders, POST /api/v1/orders/:id/cancel + 인증 바인딩(auth.Handler.Use)
- `apps/api/internal/orders/payment.go` — PGAdapter 인터페이스 + FakePG 구현(Agree/Lookup/Cancel/ProcessWebhook)
- `apps/api/internal/orders/webhook.go` — POST /api/v1/payments/toss/webhook 엔드포인트
- `apps/api/internal/jobs/orders.go` — River worker 두 개: ReservationExpireWorker, PaymentReconcileWorker
- `apps/api/internal/jobs/sample.go` — NewClient()에 주문 worker 등록 + orders import 추가
- `apps/api/internal/command/run.go` — API 시작 시 orders.Register(), RegisterWebhook() 연결
- `apps/api/openapi.yaml` — orders endpoints, schemas(CreateOrderRequest, OrderView, OrderItem, Reservation, OrderListResponse) 추가

### Domain 계약 (TypeScript/Zod)
- `packages/domain/src/orders.ts` — Zod 스키마 + 타입 정의
- `packages/domain/src/index.ts`, `schemas.ts` — exports에 orders 추가
- domain 패키지 빌드 완료 (dist/ orders.d.ts, orders.js 생성됨)

### 웹 UI (생성 완료)
- `apps/web/app/orders/page.tsx` — 내 주문 목록 페이지
- `apps/web/app/order/[id]/page.tsx` — 주문 상세 + 전체 취소 기능
- `apps/web/app/market/[id]/page.tsx` — Go 매물에 "구매하기" 버튼 추가 (usesGoImages 조건부)
- `apps/web/lib/go-listings/orders.ts` — 주문 클라이언트 API 호출 함수

### 검증 결과
- `pnpm typecheck` — PASS
- `go vet ./...` — PASS
- `go build ./...` — PASS
- `go test ./...` — PASS (platform 테스트의 Windows 권한 0600 실패는 기존 문제, 내 변경과 무관)
- 도메인 패키지 빌드 완료

---

## 2. 아직 남아있는 작업

### A. 웹 UI 보완
1. **주문서 페이지** (`/order/new/[listingId]`) 생성: 상품 정보 표시, 수량 선택, 확인 버튼 → createOrder API 호출 후 주문 상세로 리다이렉트
2. **결제 확인 페이지** (`/order/confirm/[orderId]`): 주문 상태 표시, "결제창 열기"(가짜 PG paymentKey 전달), 승인 대기 중状态 표시
3. 현재 orders/[id]/page.tsx와 orders/page.tsx에 TypeScript 에러가 남았을 수 있음 — 타입 재검사 필요

### B. OpenAPI 버전 업데이트
- `apps/api/openapi.yaml` info.version을 "0.5.0" 또는 "0.4.1"으로 업데이트

### C. Web lint 및 빌드 검증
- `pnpm --filter @icegear/web lint` 실행
- `pnpm --filter @icegear/web build` 실행하여 실제 빌드 통과 확인

### D. River worker 스케줄링
- ReservationExpireWorker와 PaymentReconcileWorker가 실제로 동작하도록 API 시작 시 periodic job enqueue 로직 추가 (또는 cron-style 진입점)

### E. 테스트 파일 추가 (선택사항이지만 권장)
- `apps/api/internal/orders/xxx_test.go` — 단위 테스트: 주문 생성/취소/권한 검증
- FakePG에 대한 테스트 케이스

### F. 격리 DB 통합 테스트 준비
- nhn-rocky 환경에서 migration 적용 가능 여부 확인
- `bash ops/nhn-rocky/test-listings-database.sh` 등으로 기존 회귀 검사와 충돌 없는지 확인

---

## 3. 중요 제약 사항 (반드시 준수)

- **ASSETS.md 규칙 준수**: git status 확인, 미커밋 변경 보존, 기준 문서 대조
- **공용 임시 계정 사용 금지**: 구매자 A/B · 판매자 A/B 별도 fixture 사용
- **가격 검증 서버사이드**: 브라우저 값 신뢰하지 않음
- **KRW 정수만**: 소수점 없음, shipping_fee=0, service_fee=0 (테스트 상품)
- **PG timeout 처리**: result 불명 상태 저장 → River worker 대조
- **중복 웹훅/역순 처리**: pg_event_id 유일 인덱스로 보호
- **비밀정보 유출 금지**: secret key, DB URL 등을 채팅/Git/로그에 넣지 않음
- **live 키 사용 금지**: PAYMENT_MODE=test 유지

---

## 4. 코드 구조 참고

```
apps/api/internal/orders/
├── model.go       // Failure, Exported errors, Seller, Listing, Order, OrderItem, Reservation, InventoryItem, PaymentAttempt, PGEvent, PaymentState
├── store.go       // Store{Pool}, CreateOrder, GetOrder, ListBuyerOrders, CancelOrder, listOrderItems, genShortID
├── store_extra.go // CreatePaymentAttempt, UpdatePaymentApprove, ListPendingPaymentOrders (public helper)
├── http.go        // Handler{Store, Auth, PGAdapter}, Register(), CRUD handlers
├── payment.go     // PGAdapter interface, FakePG {Approve, Lookup, Cancel, ProcessWebhook}
└── webhook.go     // WebhookHandler, RegisterWebhook(), handle()

apps/api/internal/jobs/
├── orders.go      // ReservationExpireWorker, PaymentReconcileWorker
└── sample.go      // 기존 SampleWorker + 주문 worker 등록 (NewClient 수정)
```

---

## 5. 우선순위

1. 웹 UI 보완 (A-1, A-2) + lint/build 검증
2. OpenAPI 버전업
3. 단위 테스트 파일 추가
4. River worker scheduling 진입점
5. 격리 DB 통합 테스트

필요하면 기존 migration을 직접 적용할 순 없으니까 (실제 Supabase 접속 안되므로), code review 차원에서 SQL 문법 정확성만 확인해줘.

완료 시 변경 파일 목록, 계약 영향, 실행 결과, 남은 작업을 보고해.

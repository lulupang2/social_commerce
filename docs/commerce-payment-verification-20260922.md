# 주문·재고 예약·키 없는 결제 기반 검증 (2026-09-22)

`docs/prompts/commerce-payment-continuation.md`의 후속 범위를 기준으로 기존 미커밋 구현을 이어 작업했다.
실제 토스페이먼츠 SDK·테스트 키 연결·PG 환불 API·운영 배포의 완료 기록은 아니다.

## 이번 구현

- `/order/new/[listingId]`: Go API의 판매 중 상품만 조회, 수량 1개, 서버 가격·재고 확인 후 주문 생성.
- `/order/confirm/[orderId]`: 가짜 PG임을 표시한 승인 화면, 서버 주문 상태 재조회, 결과 불명 시 확인 중 표시.
- 주문 클라이언트: 세션 CSRF, 응답 Zod 검증, 네트워크 실패 표시, 취소 응답 `{order}` 해제.
- 주문 저장소: 거래별 회원 컨텍스트, 구매자·판매자 RLS, 서버 가격 스냅샷, 재고 행 잠금,
  동일 구매자의 미결제 동일 상품 주문 재사용, 중복 취소 시 재고를 한 번만 복원.
- 주문 생성 요청의 수량은 1로 제한. 요청에 가격·판매자·구매자 ID를 받지 않는다.
- 승인 API: `POST /api/v1/orders/{orderId}/payments/confirm`, 구매자·금액·결제 키 확인,
  PG 호출 전 결제 시도 저장, 승인 시 주문·결제·예약 소비를 한 트랜잭션에서 반영.
- 가짜 PG는 `DB_TARGET=fixture`에서만 선택하며 별도 DB 테이블에 결과를 저장한다.
  API/worker 재시작 후 조회할 수 있다. Supabase test에서는 503으로 구성 미완료를 표시한다.
- 예약 만료: 미결제 주문만 대상. 승인 진행·결과 불명은 재고를 보존한다.
- River worker: 시작 시와 1분마다 예약 만료·결제 대조. API 프로세스는 worker를 시작하지 않는다.
  개별 작업 최대 5회 재시도 후에도 다음 주기에서 미완료 시도를 다시 찾는다.
- 웹훅: 전송 ID로 중복 제거하여 영속 저장하고 Toss 재전송 계약에 맞는 200 응답. 웹훅의 주장만으로 상태를 변경하지 않는다.
  worker가 기록된 결제 시도와 가짜 PG의 현재 키·주문·금액을 대조한다.
  이벤트 조회 실패는 최대 10회까지 기록하며, 최종 성공을 과거 상태로 되돌리지 않는다.

## 계약과 migration

기존 `0011`~`0013` 파일은 유지하고 `0014_commerce_runtime.sql`을 추가했다.
판매자와 매물은 `inventory_items.seller_id`로 명시적으로 연결한다.
재고를 구매 요청에서 자동 생성하지 않는다. migrator가 승인된 판매자·활성 소유자 구성원과
판매 중 매물을 연결한 재고 1개를 준비해야 구매할 수 있다. 준비되지 않은 상품은 404다.
API 역할로 판매자 승인이나 구성원 추가를 할 수 없도록 권한을 조정했다.
worker의 거래 테이블 권한·RLS, 주문 수량/금액 및 주문별 결제 시도 제약을 추가했다.

이전 초안으로 수량 2개 이상 주문이나 한 주문의 복수 결제 시도가 이미 존재한다면
0014의 제약 추가가 실패한다. 적용 전에 데이터 확인과 별도 forward-fix가 필요하다.
기존 재고의 seller_id는 NULL로 남으며 자동으로 다른 판매자에게 연결하지 않는다.
전체 체인의 기대 버전은 `0014_commerce_runtime`으로 갱신했다.

OpenAPI 0.5.0, 생성 타입, domain/Zod 및 HTTP 응답을 정렬하고 초안 OpenAPI의 JSON 괄호 오류를 수정했다.
신규 환경변수·의존성·lockfile 변경은 없다.
CI의 `ops/deployment/check-db.sh`와 기존 listings DB 검증 경로에 orders·jobs 패키지를 추가했다. `TOSS_*`는 여전히 실행 코드에서 소비하지 않는다.
`PAYMENT_MODE=test`와 기존 DB fixture marker 검증은 유지한다.

## 실행 결과

- 로컬 `pnpm typecheck`: 통과 (domain, web, mobile).
- `pnpm --filter @icegear/domain build`, `test`: 통과, domain 기존 테스트 13개.
- `pnpm --filter @icegear/web test`: 통과, 주문 클라이언트 5개 포함 총 23개.
- `pnpm --filter @icegear/web lint`, `build`: 통과, 주문서·결제 확인·상세·목록 경로 생성 확인.
- `node ops/nhn-rocky/generate-auth-types.mjs --check`: 통과.
- Linux `ops/deployment/check-go.sh`: module verify, `go vet -p=1 ./...`, `go test -race -p=1 -count=1 ./...`, integration 및 integration,authfixture 태그의 빈 실행 모두 통과. POSIX 0600 검사도 포함한다.
- Linux `bash ops/nhn-rocky/test-listings-database.sh`: 통과. 기존 listings·listingimages 회귀와 신규 orders·jobs 테스트를 race 모드로 순차 실행했다.
- 새 migration 적용, 구매자/판매자 권한, 재고 경쟁, 중복 취소·소비, 만료, 금액 변조, 응답 유실 후 복구, CSRF, 위조/중복 웹훅, River 시작 시 주기 작업 완료 확인.
- 브라우저: 별도 로컬 UI fixture 프록시로 주문서→가짜 PG 승인→202 확인 중→새로고침 후 완료→주문 상세 표시를 확인. 실제 Go/PG를 연결한 E2E 검증과 구분한다.

Linux 검증 소스는 `/home/rocky/projects/summergear-commerce-verify-20260922-01`에 전송했다.
기존 원격 저장소·공개 사이트·비밀 설정은 변경하지 않았다.
최초 Linux 실행은 변경한 셸 파일의 CRLF 문제로 중단했고 LF로 수정 후 재실행했다.

## 실제 PG 연결 전 남은 범위

- 토스 SDK·테스트 키 설정 검증, 실제 승인·조회·전체 환불과 PG 장애 검증.
- 현재 취소 API는 미결제 주문 취소다. 승인된 결제의 환불 API와 UI는 아직 제공하지 않는다.
- 가짜 PG의 결제 키는 fixture 전용이다. 실제 Toss paymentKey를 이 경로에 보내지 않는다.
- PG 호출 직전 프로세스가 종료되어 제공자에 기록이 아예 없는 경우는 결과 불명으로 유지한다.
  재승인·재고 자동 해제 대신 운영 확인이 필요하며, 실제 PG 연결 시 보상·운영 조정 경로가 필요하다.
- 현재 주문 생성 재사용은 구매자·상품의 pending 주문 단위다. 일반적인 Idempotency-Key
  헤더의 요청 본문 해시, 복수 결제 시도·부분 취소는 이번 후속 범위에 포함하지 않았다.
- 새 거래 기록과 River 개별 작업은 같은 트랜잭션으로 enqueue하지 않는다.
  영속 결제 시도·이벤트를 주기적으로 스캔하여 복구한다. 실제 PG 단계에서 트랜잭션 enqueue를 검토한다.
- 실제 Go API를 연결한 브라우저 E2E, Expo WebView 외부 결제 앱 복귀, 실제 소셜 로그인은 별도 검증이 필요하다.

공식 문서 확인: [결제 요청·인증·서버 승인](https://docs.tosspayments.com/guides/v2/get-started/payment-flow),
[웹훅 이벤트와 전송 ID](https://docs.tosspayments.com/reference/using-api/webhook-events),
[River 주기 작업](https://riverqueue.com/docs/periodic-jobs).
토스의 결제창 유효 시간과 별개로 앱 재고 예약은 15분이며, 예약 만료 후 첫 승인 요청은 거부한다.
실제 PG 인증이 늦게 완료되는 경우의 사용자 복구 흐름은 실제 SDK 연결 단계에서 구현해야 한다.

브랜치: 기존 `main` 유지. 새 브랜치·커밋·push·배포 없음.

## Docker 검증과 산출물

두 Compose 파일의 `config --quiet`가 통과했다.
`ops/deployment/Dockerfile.go`의 verification, api, worker, migration target 빌드가 통과했다.
verification 이미지에서 `ops/deployment/check-go.sh`를 실행했다.
새 API/worker/migration 이미지와 기존 keyless web 이미지로 `python3 ops/deployment/smoke.py`가 통과했다.
이 smoke는 프록시·세션·CSRF·역할 분리·read-only/non-root·readiness 장애/복구·컨테이너 교체·SIGTERM 검증이다.
새 웹 화면은 로컬 production build와 앞서 기록한 브라우저 fixture로 검증했으며,
새 웹 Docker 이미지나 실제 PG 연결을 검사한 것으로 해석하지 않는다.

검증 이미지 태그는 `summergear-ci-go:commerce-20260922`,
`summergear-api:commerce-20260922`, `summergear-worker:commerce-20260922`,
`summergear-migration:commerce-20260922`로 원격 Docker에 남겼다.
검증 중 사용한 기존 `deployment-ci` runtime 태그는 이전 image ID로 복원했다.
이번 실행의 DB/네트워크/볼륨과 전용 Buildx builder는 정리했다.

로컬 증거 파일 (Git 제외):

- `.foundation-cache/results/commerce-go.log`: 전체 Linux unit/vet 및 태그 컴파일.
- `.foundation-cache/results/commerce-database.log`: 격리 DB·거래·주기 작업 테스트.
- `.foundation-cache/results/commerce-smoke.log`: keyless smoke.
- `.foundation-cache/results/commerce-images.txt`: verification, API, worker, migration 순서의 image ID.

## 변경 파일 묶음

- `apps/api/internal/orders/{store,store_extra,payment,http,webhook,model}.go`와 단위·통합 테스트.
- `apps/api/internal/jobs/{orders,sample}.go`, 주기 작업 통합 테스트,
  `apps/api/internal/command/run.go`, `apps/api/internal/migrate/chain.go`.
- `supabase/migrations/0014_commerce_runtime.sql` (0011~0013의 내용은 보존).
- `apps/api/openapi.yaml`, `apps/web/lib/go-auth/schema.generated.ts`,
  `packages/domain/src/orders.ts` 및 기존 orders export.
- `apps/web/app/order/new/[listingId]/page.tsx`, `order/confirm/[orderId]/page.tsx`,
  기존 주문 상세·목록, `apps/web/lib/go-listings/orders.ts`, `orders.test.ts`.
- 기존 DB 통합 테스트 6곳의 최신 migration 기대값, `ops/nhn-rocky/in-toolchain.sh`,
  `ops/deployment/check-db.sh`, 관련 작업·검증 문서.

작업 시작 전부터 존재한 홈·이미지·preview 등의 별도 미커밋 변경은 그대로 보존했다.

## Toss webhook 후속 검증 (2026-09-23)

실제 Toss 일반 결제 webhook에는 서명 검증 계약이 없다. 전송 ID로 중복 제거하고,
수신 payload는 상태 변경의 근거가 아닌 힌트로만 저장한 뒤 서버가 보관한 payment key로
Toss 조회 API를 호출해 주문 ID·금액·상태를 대조하는 계약을 유지했다. Toss가 보내는
`PAYMENT_STATUS_CHANGED`의 `PARTIAL_CANCELED`도 취소 힌트로 받을 수 있도록 webhook과
OpenAPI enum을 정렬했다. 동일 전송 ID 재전송은 한 행으로 수렴하며 정확한 HTTP 200을 반환한다.

provider 조회에서 외부 전체 취소가 확인됐지만 로컬 환불 intent가 없었던 경우에도 완료된
전체 환불 ledger를 한 번만 생성하고 주문 취소·재고 복원을 함께 수행하도록 보강했다.
늦게 도착한 `DONE` 이벤트는 payload를 신뢰하지 않고 provider의 현재 상태를 다시 조회하므로
이미 취소된 주문을 승인 상태로 되돌리지 않는다. webhook payload의 payment key 자체는
결제 시도 조회에 사용하지 않으며, 카드·고객 데이터도 저장하지 않는다.

검증 결과:

- 로컬 `go test ./internal/orders`, integration 태그 컴파일, `git diff --check` 통과.
- Linux `bash ops/nhn-rocky/go-toolchain.sh check` 통과: module verify, vet, race unit tests와 빌드.
- Linux `bash ops/nhn-rocky/test-listings-database.sh` 최종 통과. 위조 힌트, 동일 전송 ID 중복,
  외부 취소, 순서가 뒤집힌 `DONE`, provider 대조, 환불 ledger와 재고 1회 복원을 검사했다.
- 배포 URL에 모의 `PAYMENT_STATUS_CHANGED`를 같은 전송 ID로 두 번 보냈고 두 요청 모두 200이었다.
  DB에는 한 행만 남았으며 worker가 `processed`, `verified_with_pg=true`로 처리했다. 이 결과는
  공개 endpoint와 배포 worker의 모의 전달 검증이며 Toss가 실제 전달한 이벤트가 아니다.

첫 두 번의 격리 DB 실행은 각각 API 역할의 결제 시도 RLS 경계를 넘는 구현 시도와 테스트의
잘못된 member context 때문에 실패했다. RLS 권한 확대 없이 구현을 되돌리고 테스트 context를
수정한 뒤 전체 검증을 다시 통과했다.

카드 테스트 주문 `525c54d8-07fa-4c8d-9050-2a660271753f`은 국민카드 인증 화면까지 진입했다.
Toss 테스트 환경도 유효한 실제 카드의 카드사 본인인증이 필요하므로 사용자가 Codex 내장
브라우저에서 인증을 마쳐야 승인·조회·전체 취소를 계속할 수 있다. 실제 과금은 없는 테스트
키 흐름이지만, 인증이 완료되기 전까지 카드 승인 결과는 미검증이다.

현재 서버 키는 값을 출력하지 않고 분류한 결과 Toss 공식 문서용 `_docs_` 테스트 키 묶음이다.
이 키의 가맹점은 사용자 개발자센터 소유가 아니므로 현재 구성으로는 개발자센터에 webhook URL을
등록해 실제 전달을 받을 수 없다. `/home/rocky/.config/summergear/test.env`에 같은 개발자센터
가맹점의 짝이 맞는 TEST client/secret key를 직접 넣고 mode `0600`을 유지해야 한다. 키 값을
대화나 문서에 보내지 않는다. 교체 후 등록할 endpoint는
`https://sg.jisung.lol/api/v1/payments/toss/webhook`, 이벤트는 `PAYMENT_STATUS_CHANGED`다.

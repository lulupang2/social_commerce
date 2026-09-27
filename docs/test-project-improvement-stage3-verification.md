# 테스트 프로젝트 개선 · 3단계 검증 기록

2026-09-27 · 원본 `main` 작업 트리(HEAD `0cb22f9`)에서 수행. 1·2단계의 기존 변경·검증 기록과 다른 미커밋·미추적 파일을 유지했다. 별도 브랜치·커밋·push·포 없음.

## 구현과 계약

3단계는 `docs/test-project-improvement-work-plan.md`의 **검토·테스트 판매자·재고 fixture** 범위다. 이미 구현된 코드를 현재 worktree에서 대조하고, 독립적으로 실행 가능한 검증을 수행했다.

- **매물 검토 API/RLS**: `apps/api/internal/listings/review.go`, `review_http.go`에서 검토자 전용 `GET /api/v1/reviews`, `POST /api/v1/reviews/{id}/approve|reject`, 판매자용 `POST /api/v1/listings/{id}/resubmit`, `GET /api/v1/listings/{id}/reviews`, `GET /api/v1/listings/{id}/availability`를 제공한다. `apps/api/internal/auth/config.go`의 `IsFixtureReviewer`는 fixture 역할 `reviewer`(`00000000-0000-4000-8000-000000000015`)만 검토자로 인식한다.
- **상태 전이/감사**: `pending_review` → `active`/`rejected` 전이, `rejected` → `pending_review` 재검토, `listing_review_events` 감사 기록은 `supabase/migrations/0017_listing_reviews.sql`로 관리된다. 활성(`active`) 매물은 수정이 차단되고, 반려 상태에서만 수정 후 재검토 요청할 수 있다.
- **구매 가능 여부/재고 분리**: `Availability`는 `active` 상태 + 승인된 판매자 + `inventory_items` 보유 + 재고 > 0을 동시에 만족해야 `purchasable=true`다. 승인만으로 재고가 생기지 않으므로 일반적인 주문 생성은 `not_prepared`/`sold_out`으로 차단된다.
- **재고 fixture**: `ops/nhn-rocky/provision-review-fixture.sh`와 `ops/nhn-rocky/db/review-fixture.sql`로, 승인된 fixture 매자 A와 특정 active 매물의 재고를 연결한다. 이 fixture는 disposable DB에서만 실행되며 실행 범위가 명확하다.
- **웹 UI**: `/reviews`에서 검토자가 승인/반려할 수 있고, `/my/listings`(`PersonalListings`)에서 판매자는 반려 사유 확인, 수정, 재검토 요청을 할 수 있다. `/market/[id]`와 `/order/new/[listingId]`는 `availability`를 저 확인하고 구매 불가 시 이유를 표시한다.
- **OpenAPI/도메인**: `apps/api/openapi.yaml`에 리뷰·가용성·커뮤니티 검토 경로가 포함되어 있고, `packages/domain`에 필요한 주문/버 계약이 정의되어 있다.

## Windows 0600 한 검사 실패 원인

`apps/api/internal/platform/config_test.go`의 `TestPrivateLiteralEnvFile`는 임시 `.env` 파일을 `0600`로 생성한 뒤 `0644`로 변경했을 때 `ReadEnvFile`이 거부하는지 확인한다. Windows에서는 `os.Chmod`가 POSIX 권한을 동일하게 반영하지 않아 `0644` 상태를 인식할 수 없어 `public env file accepted` 조건에서 테스트가 실패한다. 이는 실행 환경 제한이며, 테스트 코드에는 `skip`/`//go:build` 등의 완화가 없다. 이번 작업에서 테스트를 통과시키려고 추가한 skip/완화는 없으며, Linux에서 재실행하면 통과할 것으로 예상된다.

## Linux/WSL/Docker 환경 확인

- WSL 2.6.3.0은 설치되어 있으나 Docker Desktop WSL integration이 비활성화되어 있어 WSL 내부에서 `docker` 명령을 찾을 수 없음.
- Windows 셀에서 Docker daemon(`//./pipe/dockerDesktopLinuxEngine`) 연결 실패.
- 따라서 `bash ops/nhn-rocky/test-listings-database.sh` 및 `go test -tags=integration ./...` 실제 DB 통합 실행은 이 세션에서 수행 불가.

## 실행 결과

- `pnpm typecheck`: 통과 (domain, web, mobile).
- `pnpm --filter @icegear/domain build`, `test`: 통과, 13/13.
- `pnpm --filter @icegear/web test`: 통과, 31/31.
- `pnpm --filter @icegear/web lint`: 통과.
- `pnpm --filter @icegear/web build`: 통과 (Next.js 16 production).
- `cd apps/api && go test ./...`: `internal/platform`의 Windows POSIX 0600 권한 검사를 제외한 모든 패키지 통과. 이 실패는 Windows 환경의 기존 문제이며 3단계 코드와 무관하다.
- `cd apps/api && go vet ./...`: 통과.
- `cd apps/api && go test -tags=integration ./... -run '^$'`: integration/authfixture 빌드 통과.

## 미검증과 경계

- **격리 DB 통합 테스트**: `bash ops/nhn-rocky/test-listings-database.sh`는 Linux/WSL 환경에서 실행하도록 설계되어 있고, 현재 Windows 작업 세션의 셀에서는 Docker Desktop daemon(`//./pipe/dockerDesktopLinuxEngine`)에 연결할 수 없어 실행하지 못했다. `flock` 부재와 Docker daemon 연결 문제로 `Existing listings-test resources found` 또는 daemon 미연결 상태가 지속됐다. 이 검증은 Linux 환경에서 재실행해야 한다.
- **실제 브라우저 E2E**: 두 개 이상의 세션(판매자/운영자/구매자)으로 등록→검토→승인→재고 연결→주문 생성 흐름을 직접 확인하는 브라우저 검증은 이번에 수행하지 않았다. `apps/api/internal/listings/review_integration_test.go`의 `TestFixtureReviewLifecycle`가 이 흐름을 코드로 커버하고 있으며, Linux Docker 환경에서 실행 가능하다.
- **실제 PG/Storage/실기기**: 3단계 범위 밖.

## 계약 영향

- 기존 migration `0011`~`0019`는 변경하지 않았다.
- OpenAPI, domain, 웹 타입, Go API 코드 변경 없음.
- 기존 1·2단계 계약(image, memberdata, orders)은 유지.

작업 지시서의 3단계 구현은 현재 worktree에 이미 반영되어 있으며, 남은 것은 Linux 환경에서의 격리 DB 통합 실행과 브라우저 흐름 검증이다.

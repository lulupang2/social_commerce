# 테스트 서비스 흐름 구현·검증 기록

2026-09-27 시작. `main` HEAD `0cb22f9`; 시작 상태: staged 0, unstaged 85, untracked 61. 기존 1~6단계 변경 및 검증 기록은 보존하며, 아래는 별도 서비스 흐름 개선이다. 원격 push·실제 배포 없음.

## 계약과 담당

기반: Next.js → 동일 출처 Go API → PostgreSQL (`summergear_app`), River worker, 별도 migrator. `APP_ENV=test`와 fixture 로그인 가드 유지. 가격·결제·취소 판단은 서버와 PG 재대조에 남긴다. `public` legacy 경로는 근거 없이 병합/삭제하지 않는다.

| 동작 | 회원 | 승인된 판매자(해당 매물/주문) | 검토자/운영자 |
| --- | --- | --- | --- |
| 매물 등록·판매 자격 신청 | 본인 가능 | 본인 가능 | 본인 계정에 한함 |
| 매물/커뮤니티 승인·반려, 판매자 승인 | 불가 | 불가 | 서버 DB 등록 권한만 |
| 재고 판매 가능 수량 변경 | 불가 | 소유·승인 확인 후 미예약·미판매 수량만 | 소유자가 아닌 경우 불가 |
| 판매자 주문 접수·인도/발송 | 불가 | 본인 판매 주체의 승인 결제 주문만 | 임의 인도 불가 |
| 수령 확인·거래 완료 | 구매자 본인 주문만 | 불가 | 임의 완료 불가 |
| 미확정 결제 재대조 | 불가 | 불가 | 재대조 요청만, PG 근거 없이 승인 불가 |

전이: 판매자 신청 `pending → approved/rejected`(신청자 재신청은 명시적 경로), 매물 `pending_review → active/rejected`, `rejected → pending_review`; 판매 가능은 `active ∧ approved seller ∧ valid membership ∧ inventory.available > 0`. 주문 결제 승인은 테스트 PG 또는 실제 결제사 증거를 따라 확정하고, 인도는 결제 상태와 별도로 `awaiting_acceptance → accepted → handed_over → completed`로 진행한다. 수령 완료는 구매자 본인만 확정한다. 취소·환불과 인도의 경합은 주문 행 잠금 및 조건부 전이로 막으며, 인도 뒤에는 자동 취소·재고 복원을 허용하지 않는다. 기존 결제 승인 주문은 수령 완료로 소급 전환하지 않는다. 개인 직거래를 PG 결제로 자동 변환하지 않는다.

계약 소유: OpenAPI, `packages/domain`, migration 번호, 공통 라우터 `command/run.go`, lockfile은 한 흐름으로 정렬했다. 독립 A(운영자·판매자·재고), B(채팅 증분·읽음), C(CI/fixture DB) 병렬 실행을 시도했으나 실행 환경의 worker 모델이 지원되지 않아 동일 범위를 메인 작업에서 통합했다. 서로 다른 파일을 동시에 수정하거나 기존 미커밋 작업을 초기화하지 않았다.

| 범위 | 적용 | 확인 |
| --- | --- | --- |
| 운영자·판매자·재고 | `0020_service_sellers.sql`, 판매 신청·승인, DB 검토자 권한, 소유자 재고 조정, 웹 신청/검토/재고 화면 | 격리 DB 권한·상태 테스트 및 실제 Go API/브라우저 판매자 승인·매물 검토·재고 0→1 |
| 채팅·커뮤니티 | 서버 기준 keyset 커서, 읽음 경계, 대화 목록 최신 메시지/미읽음, 검토자 권한 및 알림 outbox | 격리 DB 테스트 및 구매자→판매자 메시지·미읽음 1→0 브라우저 |
| 주문 전달 | `0021_order_fulfillment.sql`, 서버 확인 결제 뒤 판매자 접수/인도, 구매자 수령, 전달 후 취소 차단 | 격리 DB 경합/권한 테스트 및 구매·승인·접수·인도·수령 브라우저 |
| 기기 알림 | `0022_push_notifications.sql`, `0024_push_receipts.sql`, Go 세션 소유 기기 등록/해제, River outbox와 Expo ticket·receipt 추적, 일부 기기 재시도와 24시간 미확인 실패 처리 | Go/격리 DB 테스트와 실제 worker 경로 smoke 확인. Expo 실제 receipt·FCM/APNs 수락·실기기 표시 여부는 미검증 |
| 결제·작업 복구 | `0023_payment_recovery.sql`, 운영자 감사 기록·결제사 재대조 작업·실패 큐, 승인 결과 추측 금지 | Go/격리 DB 테스트 및 운영자 대시보드 접근/빈 상태 브라우저. 실제 결제사 장애 복구는 미검증 |
| CI DB 발견 | fixture migration 선행, integration 패키지 자동 탐색, foundation/auth 순서 유지 | Linux 격리 DB 전체 패키지 실행 완료, 두 Compose config 통과 |

검증: Linux 컨테이너 `go test ./...`, `go vet ./...`, `go test -tags=integration ./... -run '^$'` 통과. 새 격리 PostgreSQL에 migration 0023 및 River 7 적용 후 `bash ops/nhn-rocky/test-listings-database.sh`에서 jobs/listingimages/listings/memberdata/notifications/orders/recovery/social 8개 DB 패키지 통과. 로컬 `pnpm --filter @icegear/domain build/test`, `pnpm typecheck`, `pnpm --filter @icegear/web test/lint/build`, `pnpm export:mobile:web` 통과(최종 웹 화면 수정 뒤 typecheck·web test/lint/build 재통과). Compose 두 파일 `config --quiet` 통과. Go verification Docker target 빌드는 remote root 19GiB 중 여유 790MiB 상태에서 마지막 이미지 레이어 unpack 중 `no space left on device`로 실패했고, 이번 시도에서 생긴 이미지 태그와 432MiB 캐시 엔트리만 제거했다. 무관한 기존 Docker 리소스는 정리하지 않았다. 웹 Docker target/keyless smoke는 이미지 수용 공간이 부족하여 미실행; 디스크 여유 있는 CI에서 별도 확인이 필요하다.

실제 UI 확인은 격리 fixture DB/Go API와 로컬 Next 개발 서버를 연결해 수행했다. 판매자 신청 → DB 권한을 부여한 검토자 승인 → 매물 등록/검토 → 수량 조정 → 구매자 채팅/주문/테스트 PG 승인 → 판매자 접수·인도 → 구매자 수령 완료를 브라우저에서 확인했다. 미승인 매물은 소유자 화면에서 공개 전 상태로 표시되며 구매 가능 여부 조회를 보내지 않는 것도 확인했다. 운영 복구 화면은 권한과 빈 상태만 시각 확인했다. 외부 Toss, Storage 서명, Expo 실기기/푸시, 실제 OAuth 및 운영 배포는 연결하지 않았다. 검증에 생성한 격리 DB 볼륨·컨테이너·원격 소스 스냅샷과 로컬 웹 서버/터널은 사용 후 정리했다.

추가 검증(Expo receipt): Linux 고정 Go 이미지에서 `go test -p=1 ./...`, `go vet -p=1 ./...`, `go test -p=1 -tags=integration ./... -run '^$'` 통과. 격리 PostgreSQL에 migration `0024_push_receipts`와 River 7 적용 후 `bash ops/nhn-rocky/test-listings-database.sh`의 8개 DB 패키지 통과. 별도 일회용 DB에서 실제 `ReconcileWorker.Reconcile`을 실행해 16분 지난 ticket의 receipt `ok`는 `sent`와 확인 시각을, 25시간 미확인 ticket은 공급자 재호출 없이 `failed`/`receipt_timeout`과 미확인 상태를 기록하는 것을 관찰했다. 해당 DB/컨테이너와 일회용 smoke 코드는 정리했다. 외부 Expo·FCM/APNs·실기기는 연결하지 않았다.

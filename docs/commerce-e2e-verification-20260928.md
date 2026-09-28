# 격리 거래 브라우저 E2E 검증 · 2026-09-28

## 대상과 재실행

- 검증 대상: `main`의 시작 HEAD `f9e87d9` + 이 작업에서 추가한 브라우저 E2E, Compose override, runner, Playwright 의존성. 검증 시 변경분은 **미커밋**이었다. 시작 전부터 변경돼 있던 `apps/mobile/components/webview/SummerGearWebView.tsx`, `apps/mobile/components/webview/bridge.ts`, `.commandcode/`는 이 작업과 무관하며 검사·커밋 대상으로 간주하지 않았다.
- 저장소 루트에서 `pnpm install --frozen-lockfile` 후 Docker 데몬·Chrome·pnpm을 준비하고 `bash ops/nhn-rocky/run-commerce-e2e.sh` 실행. Windows 검증에서는 `"C:/Program Files/Git/bin/bash.exe" ops/nhn-rocky/run-commerce-e2e.sh`를 사용했다. 선택적 `--grep`은 Playwright로 전달된다.
- 매번 고유 Compose 프로젝트의 PostgreSQL 17 fixture에 앱 migration `0024_push_receipts`와 River migration을 적용하고, 고정 Linux Go 이미지로 빌드한 **실제 Go API**를 기동했다. Next.js `/api/v1` 프록시는 이 API를 호출한다. DB 호스트 포트는 열지 않고 API/Next만 loopback에 바인딩한다. 기존 중지된 Docker 컨테이너·볼륨 및 다른 작업 트리를 재사용하거나 삭제하지 않는다.
- `APP_ENV=test`, `AUTH_DEV_LOGIN_ENABLED=true`, fixture OAuth 및 fake PG만 사용했다. 리뷰 운영자와 비교용 판매자 A만 DB fixture에서 사전 권한을 받았고, 판매자 B의 신청·승인부터 상품·재고·주문은 분리된 브라우저 세션이 실제 UI/API로 생성했다. 성공 API 응답은 모킹하지 않았다. 단 한 번의 주문 목록 GET 실패를 네트워크 중단으로 주입하고, 비동기 주문 GET/새로고침은 응답을 기다렸다가 **실제 API**로 전달했다. 고정 시간 대기는 없다.

## 시나리오 결과

`apps/web/e2e/commerce.spec.ts` 전체 실행: **2 tests passed (22.6s, exit 0)**. 아래 자동 결과는 모두 격리 DB·실제 API에 연결한 Playwright 결과이며 별도 수동 거래 재현으로 표현하지 않는다. 과거 2026-09-27의 순차 역할 전환 수동 기록은 [별도 검증](test-project-improvement-stage4-6-verification.md)에 있으며 이번 독립 세션 결과를 대신하지 않는다.

| 시나리오 | 자동 | 이번 수동 관찰 | 검증한 경계 |
| --- | --- | --- | --- |
| 판매자 B 신청→운영자 승인→매물 검토·승인→재고 시작 | 통과 | 별도 수동 미실행 | 역할별 UI 동작, 검토 대기·재고 0→1, DB-backed 응답 |
| 검토 전 / 승인 후 재고 없는 매물 구매 차단 | 통과 | 별도 수동 미실행 | 두 시점에 구매 링크 없음, 주문 POST 404 |
| 구매자 A 주문→fixture PG 승인→내 목록/상세 | 통과 | 별도 수동 미실행 | 주문서·주문번호·결제 상태·재고 예약/확정 |
| 판매자 접수·전달→구매자 수령→거래 완료 | 통과 | 별도 수동 미실행 | 판매자·구매자 화면과 `handed_over`/`completed` API, 최종 재고 |
| 미결제 취소·허용된 fake 결제 전체 취소 | 통과 | 별도 수동 미실행 | 예약 1→0, 복원 1회, 중복 주문/취소/환불에서 주문 ID·재고 불변 |
| 구매자 B의 구매자 A 주문 격리 | 통과 | 별도 수동 미실행 | B 목록 비어 있음, 상세 UI 오류 및 GET/취소/수령 404 |
| 일반 회원의 운영자 접근, 판매자 A의 판매자 B 주문 격리 | 통과 | 별도 수동 미실행 | 운영자 UI 권한 안내 및 API 403, 타 판매자 목록·상세 숨김·처리 404 |
| 목록→상세·결제·수령 링크 및 `#order-actions` | 통과 | 아래 화면 판독 | 일반 상세는 이동 안 함; 지연된 실제 GET 뒤 1회 스크롤/초점, 하단 탐색과 미중첩; 새로고침 대기 중 사용자가 위로 스크롤한 뒤 재이동 없음 |
| 빈 목록·조회 실패 후 재시도·로그아웃/비로그인 | 통과 | 별도 수동 미실행 | 최초 GET 한 번만 차단, 재시도는 실제 API 빈 목록; 세션/목록 401 및 로그인 안내 |
| 모바일 라이트 320px / 다크 390px 주문 상세 | 통과 | **두 PNG 직접 확인: 통과** | 가로 overflow 없음, 액션·초점 표시가 고정 하단 탐색에 가리지 않음; `.foundation-cache/playwright-results/`에 스크린샷 보존 |

## 코드·구성 검사와 범위

- `pnpm typecheck` — 통과(domain, mobile, web). 기존 모바일 미커밋 소스의 검사를 실행했지만 수정하지 않았다.
- `pnpm --filter @icegear/web test` — 45/45 통과.
- `pnpm --filter @icegear/web lint` — 통과.
- `pnpm --filter @icegear/web build` — 통과, Next.js 16.3.0의 주문·판매자·운영자 경로 포함.
- `docker compose -f ops/deployment/compose.ci.yml config --quiet` 및 `docker compose --env-file ops/deployment/config-check.env.example -f ops/deployment/compose.deploy.yml config --quiet` — 통과. 신규 E2E override는 자체 runner에서도 `config --quiet` 및 실제 기동을 통과했다.
- `bash ops/deployment/build-images.sh` — Go API·worker·migration 및 웹 keyless Docker 이미지 4개 빌드 통과(frozen lockfile 사용).
- `python ops/deployment/smoke.py` — 통과. 격리 프로젝트에서 프록시, 임시 로그인/CSRF, 잘못된 Origin 차단, readiness 장애/복구, 컨테이너 교체, non-root·역할별 DB 키 분리, 정상 종료를 확인하고 만든 자원만 제거했다.
- Go 제품 소스·OpenAPI·공통 도메인·migration은 이번에 변경하지 않았다. 이전 기록의 Linux `go test`, `go vet`, 격리 DB 통합 테스트 통과를 **이번 실행 결과로 재표기하지 않는다**. 실제 DB-backed 거래 경로의 이번 검증은 위 브라우저 suite다.

## 실패 수정과 미검증 경계

초기 runner 실패는 Windows bind mount의 Go VCS 상태 판독과 Docker Desktop의 internal-only bridge에 대한 loopback API 포트 포워딩 때문이었다. VCS를 빌드에 포함하지 않도록 설정하고 E2E 전용 네트워크를 외부 전송 가능한 별도 네트워크로 바꾼 뒤 migration/기동/검사를 완료했다. 최초 Playwright 실패는 Next route announcer와 실제 `alert`가 겹친 모호한 테스트 선택자였으며 문구로 좁혀 재실행했다. 이 세 건은 **테스트 인프라/선택자 결함**이지 확인된 제품 결함이 아니다. 실제 제품 소스의 수정을 요구하는 실패는 관찰되지 않았다.

실제 Toss 승인/취소·실제 네이버/카카오 OAuth, 외부 Supabase Storage, 모바일 실기기, 운영 배포 및 고부하 동시성은 **미실행**이다. 테스트 PG 결과를 실제 결제 검증으로 간주하지 않는다. 격리 E2E 리소스는 runner 종료 시 자기 프로젝트 범위만 정리하며, 실패 로그는 `.foundation-cache/results/<project>.*.log`에 남긴다. 원격 push·배포는 수행하지 않았다.

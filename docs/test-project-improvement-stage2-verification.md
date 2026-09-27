# 테스트 프로젝트 개선 · 2단계 검증 기록

2026-09-27 · 원본 `main` 작업 트리(시작 HEAD `0cb22f9`)에서 수행. 1단계의 기존 변경·검증 기록과 다른 미커밋/미추적 파일을 유지했다. 별도 브랜치·커밋·push·배포 없음.

## 구현과 계약

- `0016_member_personal_data.sql`은 Go 회원의 스포츠 실력과 찜을 `summergear_app`의 새 테이블에 저장한다. 회원별 RLS, 트랜잭션 범위 회원 컨텍스트, API 전용 권한을 사용한다. 기존 `public.profiles`·`public.favorites`와 Supabase Auth ID를 합치거나 삭제하지 않는다. Go 세션은 새 Go 개인 경로만 사용하며, 기존 Supabase 소비자는 기존 세션과 권한을 계속 사용한다. 브라우저/worker에 새 테이블 쓰기 권한은 없다.
- `GET/PUT /api/v1/me`, `GET /api/v1/me/listings`, `GET /api/v1/me/favorites`, `PUT/DELETE /api/v1/me/favorites/{id}`를 추가했다. 회원 ID는 요청 바디가 아닌 서비스 세션에서 가져온다. 변경에는 Origin·CSRF가 필요하고, 비공개 매물 찜은 404다. 내 판매는 검토 대기 등 소유자의 모든 상태를 조회하고, 찜 목록과 찜 수는 현재 공개 상태인 매물만 포함한다. 완료 거래 수는 구매자로서 `confirmed`인 주문 건수다. 신뢰도와 커뮤니티 작성글 수는 데이터가 없어 `미집계`로 표시한다.
- 기존 빈 바디 임시 로그인은 유지한다. `DB_TARGET=fixture`, `APP_ENV=test`, `AUTH_DEV_LOGIN_ENABLED=true`에서만 역할 목록과 구매자 A/B·판매자 A/B 역할 바디가 허용된다. 공유 preview에는 역할 선택이 노출되지 않는다. 새 환경변수는 없다. 동일 역할 재로그인 시 저장한 표시 이름과 개인 데이터가 유지된다.
- 웹의 프로필 설정·내 판매·찜 화면은 Go 회원을 우선 조회한다. 계정 전환·로그아웃·포커스 복귀에서 이전 Go 찜/프로필 상태를 비우고 다시 읽는다. 예전 로컬 저장소의 `go:` 찜도 로그아웃 후 회원 찜으로 재사용하지 않는다. 찜 쓰기 실패는 아이콘과 목록에 성공으로 반영하지 않고 오류를 표시한다. 데모와 기존 Supabase 사용자는 별도 경로로 남는다. 커뮤니티의 실제 내 글 경로는 5단계 범위다.
- OpenAPI, 생성된 웹 타입, 공통 Zod 계약과 웹 런타임 검증을 함께 갱신했다. 이미지와 주문의 기존 권한·상태 계약은 유지했다.

## 실행 결과

- `pnpm --filter @icegear/domain build`, `pnpm --filter @icegear/domain test`(13/13), `pnpm typecheck`(domain/web/mobile), `pnpm --filter @icegear/web test`(31/31), `pnpm --filter @icegear/web lint`, `pnpm --filter @icegear/web build`, `node ops/nhn-rocky/generate-auth-types.mjs --check`: 모두 통과. 브라우저 확인용으로 로컬 Go 프록시 설정을 넣은 프로덕션 웹 빌드도 통과했다. 웹 단위 테스트는 서버 실패·잘못된 응답·계정 전환 중 쓰기 차단을 확인한다.
- Linux Go 1.27.1 Docker 컨테이너에서 `go test -p=1 ./...`, `go vet -p=1 ./...`, `go test -p=1 -tags=integration ./... -run ^$`: 모두 통과. Windows 바인드 마운트의 VCS 소유권 문제 때문에 `GOFLAGS=-buildvcs=false`를 적용했다. 빈 integration 실행은 컴파일만 검사한다.
- `bash ops/nhn-rocky/test-listings-database.sh`: 최종 실행 통과. Windows Git Bash에 `flock`이 없어 단일 실행용 셸 함수로 잠금 명령만 대체하고, 실제 Go 테스트와 PostgreSQL은 격리된 Linux Docker 컨테이너에서 실행했다. `internal/memberdata`를 fixture runner에 포함해 A/B의 프로필·찜·대기 매물 분리, CSRF, 미인증, 찜 실패, 로그아웃·동일 역할 재로그인을 검증했다. 기존 listings/images/orders/jobs DB 사례도 통과했고 runner가 이번 실행의 DB volume을 정리했다.
- **실제 API/DB 브라우저 확인(모킹 아님):** 분리된 Docker PostgreSQL에 migration `0016_member_personal_data`까지 적용, Go API를 `authfixture` 로컬 HTTP 모드, Next 프로덕션 웹을 로컬 프록시로 연결했다. 브라우저에서 구매자 A 프로필 이름/스포츠 실력 저장 → 판매자 A 로그인·검토 대기 매물 등록·내 판매 조회 → 대기 매물 찜 404와 오류 표시 → 판매자 B 내 판매 빈 목록 → 격리 DB의 해당 매물만 테스트용으로 공개 상태로 변경 → 구매자 A 공개 매물 찜/프로필 수 1/찜 목록 → 구매자 B 수 0/빈 목록 → 로그아웃 후 개인 경로 401 및 구 로컬 `go:` 찜 미노출 → 구매자 A 재로그인/새로고침 후 이름·수 1·찜 유지 → 찜 해제 후 목록 비움까지 관찰했다. 공개 상태 변경은 migration 권한의 fixture 조작이며 3단계 검토 기능 구현/검증으로 계산하지 않는다. 브라우저·웹·API·DB fixture 자원은 이번 실행분만 종료/삭제했다.

재현: Linux에서는 저장소 루트에서 `bash ops/nhn-rocky/test-listings-database.sh`를 실행한다. Windows Git Bash에서는 Docker Desktop을 켠 뒤 `export MSYS2_ARG_CONV_EXCL='*'; flock() { return 0; }; export -f flock; bash ops/nhn-rocky/test-listings-database.sh`로 단일 실행한다. 브라우저 확인은 별도 `summergear-stage2-browser` Compose fixture DB에 migration CLI를 적용하고 기존 fixture DB 변수와 `AUTH_FIXTURE_HTTP=true`, `AUTH_FIXTURE_OAUTH_BASE_URL=http://127.0.0.1:19000`, `PUBLIC_WEB_URL=http://localhost:3100`, `AUTH_DEV_LOGIN_ENABLED=true`를 전달한 `authfixture` API를 `127.0.0.1:18080`에 게시한 뒤, `SUMMERGEAR_GO_API_ORIGIN=http://127.0.0.1:18080`인 Next를 `localhost:3100`에서 시작해 `/auth`부터 수행한다. 실제 외부 계정·키는 사용하지 않는다.

fixture runner의 기존 `prepare`는 `cmd`/`internal` 전체에 `gofmt`와 `go mod tidy`를 실행한다. 원래 미커밋 상태였던 Go 파일의 들여쓰기에도 영향이 있지만 해당 변경을 되돌리거나 단계 1/다른 작업의 기능을 삭제하지 않았다. 내용 변경 없이 줄 끝만 달라진 추적 파일은 원래 상태로 복구했다.

## 미검증과 경계

- 공유 preview에서 역할 선택이 실제 배포로 노출되지 않는지는 서버 구성/단위 가드로만 확인했으며 공개 배포를 실행하지 않았다. 실제 Supabase legacy 계정, Storage 서명 URL, Toss 테스트 키, 모바일 실기기, SNS 로그인은 이번 검증에 사용하지 않았다. 브라우저는 외부 호스트를 차단했으므로 기존 Supabase 목록 연결 실패를 표시했지만 Go 개인 흐름의 검증과 혼동하지 않는다.
- 기존 Supabase 회원과 새 Go 회원을 자동 병합하지 않는다. 실제 소유권 이전 정책이 없는 상태에서 기존 `public` 권한을 철회하면 기존 소비자가 중단되므로 새 Go 테이블만 서버 전용으로 제한했다. 게시글·신뢰점수·판매 승인/재고는 이후 단계이며 2단계 완료에 포함하지 않았다.

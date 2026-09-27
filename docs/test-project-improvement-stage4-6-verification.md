# 테스트 프로젝트 개선 · 3~6단계 실행 검증 기록

2026-09-27 · 원본 작업 트리 `main` (HEAD `0cb22f9`)의 현재 미커밋·미추적 소스를 별도 Linux 디렉터리로 복사해 검증했다. 로컬 구현 파일은 수정하지 않았다. 원격의 기존 `/home/rocky/projects/socialapp` 및 실행 중인 서비스는 건드리지 않았다. 격리 경로는 `/home/rocky/projects/summergear-stage46-verify-20260927`이며 `.env*`, Git 메타데이터, 빌드 산출물, 의존성 디렉터리는 복사하지 않았다. 실제 배포·원격 Git push·커밋은 없다.

## 결과 요약

| 구분 | 결과 |
| --- | --- |
| 구현됨 | 3단계 검토/재검토와 테스트 재고 fixture, 4단계 서버 검색·정렬·cursor 페이지, 5단계 회원 채팅·커뮤니티·내 글, 6단계 설정 기반 추천/이유 및 주문·취소 코드가 작업 트리에 있음 |
| 실행 검증됨 | Linux Go 검사와 통합 태그 컴파일, 격리 Postgres를 사용한 Go DB 통합, 실제 Go API·격리 DB를 호출한 브라우저에서 아래 3~6단계 주요 시나리오 |
| 미검증 | 별도 자동화 브라우저 E2E 경로, 브라우저에서 동시에 열린 독립 쿠키 컨텍스트 2개(세션은 순차 전환), 빠른 검색어 변경·빈 결과·오류 후 재시도, 실제 Toss/Storage/OAuth, 실기기, 외부 배포 |

## Linux Go 검사 및 테스트 포함 범위

접속 가능한 `nhn-rocky`에 작업 트리 스냅샷을 복사했다. Linux `gofmt` 검사에서 기존 변경 Go 파일 20개가 포맷 기준을 통과하지 못해 전체 Go 검사가 처음 중단됐다. 원본 작업 트리는 보존하고 격리 복사본에만 `gofmt`를 적용한 뒤 아래 검사를 통과했다.

- `bash ops/nhn-rocky/go-toolchain.sh check` — 통과. gofmt gate, `go mod verify`, `go vet -p=1 ./...`, `go test -race -p=1 -count=1 -v ./...`, Linux 권한 테스트, API/worker/migrate/sample 빌드를 포함한다.
- `go test -p=1 -tags=integration -run '^$' ./...` — 통과(컴파일 전용).
- `go test -p=1 -tags=integration,authfixture -run '^$' ./...` — 통과(컴파일 전용).
- 통합 테스트 패키지 실행 스크립트 `ops/nhn-rocky/go-toolchain.sh listings-integration`의 실제 실행 대상은 `listings`, `listingimages`, `orders`, `jobs`, `memberdata`, `social`이다. 따라서 검토·검색, 주문, 주기 작업, 회원 격리·추천, 채팅·커뮤니티 테스트가 포함된다. `check-db.sh`의 더 좁은 패키지 목록만으로 이 포함 여부를 판단하지 않았다.

Linux 로그는 격리 복사본의 `.foundation-cache/results/go-check.log` 및 `integration-compile.log`에 남겼다.

## 격리 DB 통합 검사

실행 명령: `bash ops/nhn-rocky/test-listings-database.sh` — 통과, exit 0. 스크립트가 실행별 이름의 Compose 리소스와 disposable Postgres fixture를 만들고, migration·회원 세션 소유권·RLS 검증 후 자신이 만든 컨테이너/볼륨/네트워크를 정리했다. 운영 DB나 비밀 파일을 사용하지 않았다.

실행 결과에서 다음 실제 DB 테스트의 `PASS`를 확인했다.

- 3단계: `TestFixtureReviewLifecycle` — 검토 승인/반려 상태 전이.
- 4단계: `TestCatalogPagesAndFilters` — 페이지와 필터.
- 5단계: `TestMemberDataIsolation`, `TestGoSessionChatAndCommunity` — 회원 데이터 격리, Go 세션 채팅/커뮤니티.
- 6단계: `TestRecommendationRankingAndReasons` — 추천 순위와 사유.
- 핵심 거래: `TestCommerceFixture`, `TestCommercePeriodicJobs` — 주문·취소·재고·멱등성 및 주기 작업.
- 마지막 요약: `PASS: Go listings migration, session ownership, RLS isolation, create/read/update/public-read`.

로그: `.foundation-cache/results/listings-database.log`. 통합 태그 빈 실행은 컴파일 확인으로만 분류했으며 DB 검증 결과에 포함하지 않았다.

## 실제 API·DB 브라우저 시나리오

실제 Go API와 disposable Postgres를 별도 Compose 프로젝트로 실행하고 API를 로컬 포트 포워딩을 통해 브라우저에 연결했다. Next 웹 화면은 해당 Go API 주소를 사용했다. 로그인은 `APP_ENV=test`, `AUTH_DEV_LOGIN_ENABLED=true`, 격리 fixture 전용 OAuth 설정만 이용했다. PG는 fake 테스트 제공자 흐름으로 확인했으며 실제 Toss 승인은 하지 않았다.

### 3단계 · 등록, 승인/반려, 수정·재검토, 공개와 구매

판매자 A가 화면에서 매물을 등록했고 검토자 계정에서 반려했다. 반려 사유가 판매자 화면에 표시됐다. 판매자가 가격을 수정하고 재검토를 요청한 뒤 검토자가 승인하자 공개 상세 화면에 나타났다. 검토만으로 재고가 자동 생성되지 않아 처음에는 구매 불가 안내가 표시됐다. 격리 fixture에 승인된 테스트 판매자/재고를 연결한 뒤 구매 버튼이 나타나는 것을 확인했다. 다른 회원으로 주문을 만들고 fake 결제 승인·전체 취소까지 완료했으며 취소 성공 안내를 확인했다.

### 4단계 · 31개 상품 검색, 다음 페이지, 정렬·필터 복원

격리 DB에 검색용 상품 31개를 넣고 실제 `/market` 화면에서 검색했다. 첫 페이지 24개 이후 `상품 더 보기`로 나머지 7개를 불러왔고 첫 페이지 밖 상품도 확인했다. 종목·카테고리·지역·가격 범위를 조합하고 낮은 가격순으로 정렬해 일치하는 5개를 확인했다. 새로고침과 뒤로가기로 URL 기반 필터/정렬 상태가 복원됐다.

### 5단계 · 회원별 채팅, 읽음, 접근 차단, 내 글

구매자 A가 판매자에게 문의하고 메시지를 전송했다. 판매자 A의 채팅 목록에서 읽지 않은 수가 증가했고 대화를 열어 메시지를 읽은 뒤 답장했다. 구매자 A로 돌아와 양쪽 메시지를 확인했다. 구매자 B로 전환해 같은 대화 URL을 열자 접근 거부 화면이 표시됐다. 구매자 B가 커뮤니티 글을 작성했고 검토 대기 상태와 `/my/posts`의 개인 목록에 나타났다.

브라우저 도구가 같은 쿠키 컨텍스트의 탭만 제공해 위 역할은 같은 실제 브라우저 컨텍스트에서 순차 전환했다. 서로 다른 실제 회원과 권한은 사용했으며 동시 독립 브라우저 세션은 브라우저에서 확인하지 않았다. 별도 DB 통합 테스트는 회원 격리 및 Go 세션을 검사했다.

### 6단계 · 설정 기반 추천과 핵심 거래

회원 프로필을 서핑/예산 300,000/서울로 설정했을 때 홈 추천 제목과 상품 설명에 선호 종목·예산·지역 일치 사유가 표시됐다. 이어 테니스/예산 20,000/부산으로 바꾸자 홈 결과가 구매 가능 장비 기본 목록으로 바뀌고 이전 추천 사유가 사라졌다. 위 3단계 시나리오에서 실제 API/DB 주문, fake 결제 승인, 전체 취소도 확인했다.

## 미검증 범위 및 영향

- 계획에 적힌 반복 실행 가능한 자동화 브라우저 E2E 경로는 구현/실행하지 않았다. 이번 브라우저 검사는 요청한 주요 흐름을 수동으로 실제 API/격리 DB에 연결해 확인한 결과다.
- 4단계의 빠른 검색어 경쟁 응답, 빈 결과, 실패 후 재시도는 이번 브라우저 시나리오에 포함하지 않았다.
- 브라우저 역할 전환은 순차 진행했으며 동시에 열린 독립 로그인 세션 간 화면 검증은 하지 않았다. 별도 회원 권한과 격리는 DB 통합 테스트로 확인했다.
- 실제 Toss 키·카드, 외부 Storage/OAuth, 모바일 실기기 및 운영 배포 검증은 범위 밖이며 실행하지 않았다.
- 이 검증 때문에 로컬 앱 소스, API/OpenAPI/domain 계약, migration, 환경 변수, 의존성은 변경하지 않았다. migration은 격리 disposable DB에만 적용했다. 로컬에서 추가한 변경은 이 실행 결과를 기록한 이 문서와 작업 지시서의 상태 표시뿐이다.
- 격리 API·DB와 로컬 Next/SSH 터널은 검사 후 종료했다. 기존 원격 서비스 및 `/home/rocky/projects/socialapp` 저장소는 그대로 두었다. 검증 스냅샷과 로그는 재현·검토를 위해 위 전용 디렉터리에 남아 있다.

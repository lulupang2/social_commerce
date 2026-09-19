# Go API·River 기반 검증 기록

기반 검증일: 2026-09-18 · 추가 검증일: 2026-09-20 · 브랜치: `codex/nhn-rocky-setup`

기준 커밋 `831f615`의 기존 앱·문서를 확인한 뒤 별도 Go 기반을 추가했습니다. 이 기록은 격리된 PostgreSQL fixture 검증이며, Supabase 실연결·기존 전체 RLS·로그인·결제·운영 배포 검증이 아닙니다. 커밋·push·운영 배포는 수행하지 않았습니다.

## 실행한 검사

저장소 루트에서 아래 순서로 실행했습니다.

```sh
bash ops/nhn-rocky/go-toolchain.sh prepare
bash ops/nhn-rocky/test-foundation.sh
```

| 검사                                                                                    | 결과                                                       |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `gofmt`, `go mod tidy`, `go mod verify`                                                 | 통과                                                       |
| `go build -p=1 ./...`, 네 개 정적 실행 파일 빌드                                        | 통과                                                       |
| `go vet -p=1 ./...`                                                                     | 통과                                                       |
| `go test -race -p=1 -count=1 -v ./...`                                                  | 최상위 단위 테스트 6개 통과, 설정 검증 하위 사례 18개 포함 |
| `go test -race -p=1 -tags=integration -count=1 -timeout=240s -v ./internal/integration` | 통합 시나리오 11개 통과                                    |
| Compose migration·API·worker·sample                                                     | 기동·health·실제 작업 완료·정상 종료 통과                  |

전체 스크립트를 2회 실행했고 모두 종료 코드 0으로 통과했습니다. 최종 실행에서는 컨테이너별 DB 자격 증명·포트·네트워크 분리도 Docker inspect로 확인했습니다. 첫 통합 실행은 28.83초였으며 SIGKILL 복구 시나리오가 25.98초였습니다. 수치는 해당 실행의 관측치이지 SLA가 아닙니다. 테스트 로그는 `.foundation-cache/results/unit-build.log`, `integration.log`, 최종 재실행 로그는 `final-suite.log`에 남깁니다.

## 2026-09-20 추가 검증: 서비스 세션과 Go 매물 1차 전환

환경: 현재 Windows 작업공간 + Docker Desktop의 격리 PostgreSQL fixture. Hosted Supabase나 실제 네이버·카카오에는 연결하지 않았습니다. 고정 Go 1.27.1 컨테이너와 PostgreSQL 17.11 fixture를 사용했습니다.

| 검사 | 결과 |
| --- | --- |
| `go test -p=1 ./...` (Go 1.27.1 컨테이너) | 전체 Go 단위 테스트 통과 |
| `go vet ./...` (Go 1.27.1 컨테이너) | 통과 |
| `internal/listings` 격리 DB 통합 바이너리 | `0007`→`0008`→`0009` 적용, 임시 로그인 실제 세션, 매물 등록·소유자 조회·수정, RLS 격리, 공개 전 404, 공개 후 조회, worker 접근 거부 통과 |
| 기존 `internal/integration` foundation 회귀 | 현재 앱 manifest까지 올린 뒤 River 트랜잭션·재시도·SIGKILL 복구·API readiness 시나리오 통과 |
| Next.js 변경 범위 ESLint, `next build` | 통과 |
| `node ops/nhn-rocky/generate-auth-types.mjs --check` | OpenAPI 생성 타입 최신 상태 통과 |

매물 회원 컨텍스트는 서비스 세션에서 얻은 내부 회원 ID만 사용하고 한 DB 트랜잭션의 `set_config(..., true)`에 한정했습니다. 통합 테스트에서 다음 API 풀 쿼리에 회원 컨텍스트가 남지 않는 것, 다른 회원이 비공개 매물을 읽거나 수정할 수 없는 것, `active` 전환 뒤에만 익명 조회되는 것을 확인했습니다. `summergear-listings-test`와 `summergear-foundation-test` fixture 컨테이너·네트워크·볼륨은 검증 후 삭제했습니다.

이미지 Storage 업로드·서명 URL, 기존 `public.listings` 데이터 이관·직접 쓰기 차단, hosted Supabase 역할/TLS/pooler는 이번 추가 검증 범위가 아닙니다.

## 통합 시나리오

| 시나리오                | 확인한 사실                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 공식 migration과 재실행 | 앱 `0007`과 River 공식 1~7 적용, 반복 적용, 적용된 SQL checksum 변경 거부                                                             |
| commit과 공개 시점      | commit 전 업무·작업 모두 다른 연결에서 보이지 않으며 commit 후 작업 존재                                                              |
| rollback                | 같은 트랜잭션의 업무 레코드와 작업 모두 남지 않음                                                                                     |
| 실제 등록 실패          | API의 큐 INSERT 권한을 fixture에서 일시 회수하면 enqueue 실패와 함께 업무 생성도 rollback                                             |
| 동시 중복 등록          | 같은 멱등 키의 동시 요청 4개가 같은 업무·작업 ID를 반환                                                                               |
| 권한 경계               | API의 큐 상태 수정·삭제·효과 등록·DDL·marker 수정 거부, worker의 migration 이력 수정·DDL 거부, 브라우저 역할 private 스키마 접근 차단 |
| worker 실행             | 별도 worker 프로세스가 commit된 작업을 처리하고 효과 1개 기록                                                                         |
| 재시도·최종 실패        | 1회 실패 후 2번째 시도 성공, 최대 2회 작업은 2회 뒤 discarded, 실패 작업 효과 없음                                                    |
| 강제 종료·복구          | running 확인 뒤 실제 SIGKILL, 작업 시간·상태를 직접 고치지 않고 새 worker의 River rescuer가 복구                                      |
| 중복 효과 방지          | 동일 업무 효과 반복 호출과 중복 작업 재실행에도 효과는 1개                                                                            |
| HTTP 장애·종료          | 실제 API 프로세스 readiness 200, DB 조회 권한 회수 시 503, live 200, 미구현 업무 경로 404, SIGTERM 정상 종료                          |

재시도 가속과 장애 주입은 fixture에만 허용했습니다. 외부 결제·알림에 대한 exactly-once 실행이나 일반 네트워크 장애 복구를 이 결과로 주장하지 않습니다. DB TCP 단절·Supabase pooler 재연결·운영 부하 테스트는 별도입니다.

## 버전과 격리

Go 1.27.1, Fiber 3.5.0, River/riverpgxv5 0.47.0, pgx 5.11.0, PostgreSQL fixture 17.11을 사용했습니다. 모듈과 도구·DB 이미지 digest는 저장소에 고정합니다. 호스트 Go는 설치하지 않았습니다.

테스트는 `summergear-foundation-test` 전용 네트워크·볼륨에서 수행했습니다. 호스트 공개 포트, 운영 네트워크 공유, Docker socket 전달은 없습니다. API·worker 컨테이너에는 각자 자기 DB 연결만 전달하며 migration 연결은 별도 명령에만 있습니다. 테스트 종료 시 해당 프로젝트의 컨테이너·네트워크·볼륨만 삭제하고 캐시·검증 로그는 Git 제외 경로에 유지합니다.

기존 서비스 네 개의 container ID·StartedAt·RestartCount·실행 상태와 private env 파일 해시를 실행 전 기록과 대조하여 모두 동일함을 확인했습니다. 설정값·해시는 출력하지 않았습니다. 최종 fixture 컨테이너·네트워크·볼륨 잔존 수는 각각 0입니다. 기존 frontend, Node·pnpm 버전과 `0001`~`0006` SQL도 Git diff로 변경 없음을 확인했습니다.

## 실제 Supabase 검증을 막는 설정

`/home/rocky/.config/summergear/test.env`의 권한은 0600이며 원본을 변경하지 않았습니다. 실제 바이너리의 `--env-file ... --check-config` 실행은 `DB_TARGET` 미설정으로 예상대로 거부됐고 DB 연결을 시도하지 않았습니다.

현재 비어 있는 `DATABASE_URL`, `RIVER_DATABASE_URL`, `MIGRATION_DATABASE_URL`을 역할별 테스트 연결로 채워야 합니다. 추가로 `DB_TARGET=supabase-test`, DBA가 등록한 `DB_TARGET_ID`가 필요합니다. TLS CA·IPv4/IPv6·direct/session pooler·실제 DB 권한은 값이 준비된 후 검증합니다.

`PUBLIC_WEB_URL`, 네이버·카카오 키와 callback, 토스페이먼츠 키도 아직 비어 있습니다. 현재 Go 기반의 시작에는 OAuth·PG 키가 필요하지 않습니다. 로그인 준비 항목은 [실행 안내](../ops/nhn-rocky/FOUNDATION.md#다음-단계-네이버카카오-로그인)를 참고합니다.

## 남은 범위

Supabase hosted 실연결과 전체 기존 스키마 재생·기존 `public.*`의 회원별 RLS 이관, 네이버·카카오 실제 제공자 로그인, 기존 회원 연결·WebView OAuth 복귀, 이미지 Storage 전환, 결제 전체 구현과 운영 배포는 수행하지 않았습니다. Go 서비스 세션과 신규 `summergear_app.listings`의 회원별 RLS는 격리 fixture에서만 검증했습니다. 환경별 실행 방법과 DBA bootstrap 주의 사항은 [기반 실행 안내](../ops/nhn-rocky/FOUNDATION.md)에 있습니다.

# Go API·River 기반 실행 안내

Go API, 별도 worker, 역할별 DB 연결과 격리 검증을 설명합니다. Go 서비스 세션과 OAuth 코드는 추가되었고 개발 중에는 테스트 전용 임시 로그인을 사용할 수 있지만, 실제 네이버·카카오 연동·결제·운영 배포는 포함하지 않습니다. 실제 검증 기록은 [검증 결과](../../docs/foundation-verification.md)에 별도로 남깁니다.

## 고정 버전과 파일

Go 1.27.1, Fiber 3.5.0, River/riverpgxv5 0.47.0, pgx 5.11.0을 사용합니다. Go 모듈의 전이 의존성은 `apps/api/go.mod`와 `go.sum`, 도구 이미지의 digest는 `go-toolchain.sh`와 테스트 Compose에 고정합니다. 테스트 DB는 PostgreSQL 17.11이며 Supabase의 실제 서버 버전을 검증한 것은 아닙니다.

| 경로                                         | 역할                                               |
| -------------------------------------------- | -------------------------------------------------- |
| `apps/api/cmd/api`                           | Fiber HTTP 프로세스, River insert-only 클라이언트  |
| `apps/api/cmd/worker`                        | River 실행·재시도·중단 작업 복구                   |
| `apps/api/cmd/migrate`                       | 명시적인 앱·River migration과 상태 조회            |
| `apps/api/cmd/sample`                        | 업무 데이터와 작업을 한 트랜잭션으로 등록하는 CLI  |
| `apps/api/internal/platform`                 | 설정, JSON 로그, 역할·DB 대상 검사                 |
| `apps/api/internal/jobs`                     | 트랜잭션 서비스와 멱등 샘플 worker                 |
| `apps/api/internal/auth`                     | 서비스 세션·OAuth·테스트 임시 로그인              |
| `apps/api/internal/listings`                 | Go 소유 매물 등록·조회·수정과 회원 컨텍스트/RLS   |
| `supabase/migrations/0007_go_foundation.sql` | Go/River 기반 스키마                               |
| `supabase/migrations/0008_go_auth.sql`       | 내부 회원·identity·서비스 세션                     |
| `supabase/migrations/0009_go_listings.sql`   | 첫 Go 소유 업무 테이블과 매물 RLS                  |
| `ops/nhn-rocky/db/bootstrap.sql`             | DBA가 별도로 실행하는 신규 테스트 역할·스키마 준비 |

호스트 Go·Node·pnpm은 설치하거나 변경하지 않습니다. 빌드 도구는 Docker 안에서만 실행합니다. 테스트 Compose의 API와 worker도 도구 이미지를 재사용합니다. 이는 테스트 편의를 위한 구성으로, 최소 크기의 운영 이미지·운영 배포 구성은 별도 작업입니다.

## nhn-rocky에서 전체 검증

저장소 루트에서 실행합니다.

```sh
cd /home/rocky/projects/socialapp
bash ops/nhn-rocky/go-toolchain.sh prepare
bash ops/nhn-rocky/test-foundation.sh
bash ops/nhn-rocky/test-listings-database.sh
```

첫 명령은 Go 파일 포맷, lockfile 정리·검증, 컴파일을 수행합니다. 반복 검증만 할 때는 두 번째 명령으로 충분합니다. 고정 버전은 변경하지 않습니다.

전체 검증은 `go vet`, `go test -race`, 네 개 실행 파일 빌드, 격리 DB 통합 테스트, Compose API·worker·migration·sample 실행을 순서대로 수행합니다. 실행 파일은 `.foundation-cache/bin`, 로그는 `.foundation-cache/results`에 남으며 Git에서 제외됩니다.

테스트 전용 프로젝트 이름은 `summergear-foundation-test`입니다. 포트는 호스트에 공개하지 않고 전용 내부 네트워크와 일회용 볼륨을 사용합니다. 같은 이름의 기존 자원이 있으면 시작을 거부하며, 이 실행이 만든 자원만 종료 시 정리합니다. 다른 프로젝트의 컨테이너·네트워크·볼륨에는 접근하거나 prune하지 않습니다.

이 테스트는 서버 `test.env`를 읽지 않습니다. Compose에 적힌 계정은 외부에서 사용하면 안 되는 공개 일회용 fixture 계정이며, Supabase 계정이 아닙니다. 역할 세 개의 연결을 함께 받는 프로세스는 통합 테스트 실행기뿐입니다. 실제 API·worker 컨테이너와 통합 테스트의 자식 프로세스에는 각각 자기 역할의 연결만 전달합니다.

Go 도구 컨테이너는 CPU 1개·메모리 768MiB, PostgreSQL은 CPU 0.5개·192MiB, API와 worker는 각각 CPU 0.5개·128MiB로 제한합니다. 컴파일은 `GOMAXPROCS=2`, `-p=1`로 직렬화합니다. 호스트 여유 자원은 작업 전에 다시 확인합니다.

## HTTP와 작업 계약

`GET /health/live`는 프로세스 생존을 확인합니다. `GET /health/ready`는 DB 연결과 신규 앱·큐 테이블 접근 권한을 확인하며, DB 장애·권한 부족·종료 중에는 503을 반환합니다. 일반 오류는 `code`, `message`, `requestId`를 포함합니다. 요청 ID는 서버가 새로 생성하며 전달된 임의 값을 로그에 사용하지 않습니다.

공개 샘플 작업 쓰기 API는 없습니다. `/api/v1/auth`에는 서비스 세션 API가 있고 `/api/v1/listings`에는 첫 업무 수직 슬라이스가 있습니다. 공개 목록은 `active` 매물만 반환하고, 생성·수정은 서비스 세션·Origin·CSRF를 통과한 회원만 가능합니다. 요청 본문·쿼리·쿠키·인가 헤더·DB 연결 문자열을 로그에 남기지 않고, panic과 DB 오류는 일반화합니다.

샘플 CLI는 `--key`를 멱등 키로 사용합니다. `sample_requests` 생성, River `InsertTx`, 작업 ID 연결을 한 pgx 트랜잭션으로 처리합니다. worker는 `sample_effects.request_id`의 유일 제약으로 중복 DB 효과를 방지합니다. 외부 API에 대한 exactly-once 실행을 보장하지 않습니다.

기본 작업 제한은 30초, 중단 판정은 1분이며 River가 중단 작업을 주기적으로 확인합니다. 기본 재시도는 River 정책, 샘플 최대 시도는 3회입니다. 최종 실패 작업은 자동 삭제하지 않습니다. 운영자 재처리 UI·알림은 이번 범위가 아닙니다. `FIXTURE_FAST_JOBS=true`와 장애 주입 인자는 격리 fixture에서만 허용합니다.

API는 SIGTERM/SIGINT 시 readiness를 내리고 HTTP 요청을 정리합니다. worker는 실행 중 작업을 제한 시간 동안 마친 뒤 종료하며, 초과 시 취소해 다음 실행의 복구 대상으로 남깁니다. River 자동 reindex는 비활성화했습니다. 인덱스 유지보수 때문에 worker에 객체 소유권·DDL 권한을 부여하지 않습니다.

## Supabase 테스트 연결 준비

현재 `test.env`는 보존합니다. 아래 설정을 추가·입력해야 실제 Supabase 검증을 진행할 수 있습니다. 값은 채팅이나 Git에 넣지 않습니다.

| 설정                     | 내용                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `DB_TARGET`              | `supabase-test`                                             |
| `DB_TARGET_ID`           | 테스트 DB의 사전 등록 marker와 같은 16자 이상의 고유 식별자 |
| `DATABASE_URL`           | `summergear_api` 역할의 PostgreSQL URL                      |
| `RIVER_DATABASE_URL`     | `summergear_worker` 역할의 direct 또는 session URL          |
| `MIGRATION_DATABASE_URL` | `summergear_migrator` 역할의 별도 URL                       |

외부 연결에는 `sslmode=verify-full`을 요구합니다. 필요한 경우 Supabase 인증서 파일을 연결 URL의 `sslrootcert`로 지정합니다. worker의 transaction pooler 포트 6543은 거부합니다. API만 transaction pooling을 사용하는 경우 `DATABASE_CONNECTION_MODE=transaction`으로 지정해 pgx의 statement cache 방식을 변경합니다. 실제 pooler·IPv4/IPv6·TLS 연결 확인은 별도 Supabase 테스트 프로젝트에서 수행해야 합니다.

API 풀 기본 2개, worker 풀 5개, migration 풀 3개입니다. River의 별도 LISTEN 연결도 전체 DB 한도에 포함해야 합니다. migration은 상시 실행하지 않으며 낮은 worker 동시성 1로 시작합니다. 모든 설정과 제한은 [.env.example](.env.example)을 참고합니다.

### DBA 사전 준비

운영이 아닌 별도 Supabase 테스트 프로젝트인지 먼저 확인합니다. `db/bootstrap.sql`은 새 역할·새 스키마만 만들며 기존 이름이 있으면 실패합니다. 기존 역할을 덮어쓰거나 비밀번호를 변경하지 않습니다.

DBA가 안전한 비밀 전달 경로로 `SUMMERGEAR_API_PASSWORD`, `SUMMERGEAR_WORKER_PASSWORD`, `SUMMERGEAR_MIGRATION_PASSWORD`, `DB_TARGET_ID`를 psql 프로세스 환경에 제공한 뒤 bootstrap을 실행합니다. 비밀번호를 명령행 인자에 넣거나 shell tracing·psql echo를 사용하지 않습니다. 애플리케이션 자체에 DBA 계정을 전달하지 않습니다.

bootstrap은 `summergear_meta`, `summergear_app`, `summergear_river`만 준비합니다. marker는 이 DB가 승인된 테스트 대상임을 확인하기 위한 장치입니다. 같은 marker를 운영·다른 프로젝트에 복제해서는 안 됩니다. 이 이름 확인이 운영 DB 구분에 대한 사람의 검토를 대신하지 않습니다.

### 역할과 migration

API는 샘플 업무 생성·조회·job ID 연결과 작업 등록만 할 수 있습니다. River 0.47.0의 INSERT conflict 절 때문에 `river_job.kind`에 한정된 UPDATE 권한도 필요합니다. API는 작업 상태 변경·삭제를 할 수 없습니다. worker는 큐 운영 DML과 샘플 효과 등록만 허용되며 migration 이력을 변경할 수 없습니다. 두 runtime 역할 모두 superuser·BYPASSRLS·role membership·DDL 권한을 사용하지 않습니다.

스키마·테이블은 migration 역할이 소유합니다. `PUBLIC`, `anon`, `authenticated`의 신규 스키마 접근은 차단하며 Supabase Data API 노출 목록에 신규 스키마를 추가하지 않습니다. 샘플 테이블에는 역할별 RLS가 적용되고, `0009_go_listings.sql`부터는 Go가 검증한 서비스 세션 회원 ID를 트랜잭션 로컬 `summergear.member_id`에 설정해 소유자 RLS를 적용합니다. 통합 테스트는 다음 풀 사용 시 컨텍스트가 남지 않는지도 확인합니다.

DBA bootstrap 이후 migration 명령은 순서가 고정된 앱 manifest `0007` → `0008` → `0009`와 공식 River migration 1~7을 적용합니다. 앱 파일 checksum과 이력은 `summergear_meta.schema_migrations`, River 이력은 `summergear_river.river_migration`에 따로 보관합니다. advisory lock으로 동시에 실행되는 migration을 거부하고, 적용된 앱 SQL 내용 변경도 거부합니다. API·worker 시작 시 자동 migration은 없습니다.

`0001`~`0006`은 그대로 보존하며 plain PostgreSQL fixture에 실행하지 않습니다. Supabase CLI로 기존 전체 migration을 재생하는 환경은 `0007` 전에 역할·스키마 bootstrap이 필요합니다. 기존 CLI를 무조건 reset하거나 운영 DB에 이 SQL을 적용하지 않습니다.

### 서버 설정 파일 사용

아래 명령은 DB 준비와 설정 입력 후에만 실행합니다. 이번 작업에서는 hosted DB 연결을 수행하지 않습니다.

```sh
cd /home/rocky/projects/socialapp
.foundation-cache/bin/api --env-file /home/rocky/.config/summergear/test.env --check-config
.foundation-cache/bin/worker --env-file /home/rocky/.config/summergear/test.env --check-config
.foundation-cache/bin/migrate --env-file /home/rocky/.config/summergear/test.env --apply \
  --app-migrations-dir supabase/migrations
.foundation-cache/bin/migrate --env-file /home/rocky/.config/summergear/test.env \
  --app-migrations-dir supabase/migrations
```

기동은 API와 worker를 별도 터미널에서 실행합니다.

```sh
.foundation-cache/bin/api --env-file /home/rocky/.config/summergear/test.env
.foundation-cache/bin/worker --env-file /home/rocky/.config/summergear/test.env
.foundation-cache/bin/sample --env-file /home/rocky/.config/summergear/test.env --key first-sample
```

공유 설정 파일을 읽더라도 각 Config와 DB 풀에는 자기 역할 URL만 사용합니다. 더 강한 OS 비밀 접근 분리가 필요한 배포에서는 역할별 파일·secret을 분리해 전달해야 합니다. 테스트 Compose에는 이를 역할별 환경변수로 분리해 구현했습니다.

## 다음 단계: 네이버·카카오 로그인

테스트 도메인과 동일 출처 HTTPS `/api/v1` 라우팅을 먼저 확정합니다. `PUBLIC_WEB_URL`과 아래 서버 전용 설정이 필요합니다.

- 네이버: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_REDIRECT_URI`.
- 카카오: `KAKAO_CLIENT_ID`에는 REST API 키, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`.

콜백 경로는 `/api/v1/auth/naver/callback`, `/api/v1/auth/kakao/callback`으로 구현되어 있습니다. 다만 실제 제공자 키·테스트 도메인 연결은 보류했습니다. 그 전까지 `AUTH_DEV_LOGIN_ENABLED=true`인 테스트 환경에서는 `POST /api/v1/auth/dev-login`으로 실제 `auth_sessions` 기반 임시 세션을 발급할 수 있습니다. 카카오는 이후 로그인 사용 설정과 redirect URI, 클라이언트 시크릿을 확인하고 네이버는 애플리케이션·서비스 URL·callback과 테스트 계정/검수 범위를 준비합니다.

[인증 설계](../../docs/authentication.md)에 따라 세션 유휴·절대 만료, CSRF, Origin, 일회성 state와 브라우저 바인딩, 기존 회원 연결·복구 정책을 확정합니다. 이메일 일치만으로 계정을 병합하지 않습니다. Expo는 외부 브라우저 로그인 뒤 일회성 전달 코드를 통해 WebView 세션을 설정하는 흐름과 실제 iOS·Android 테스트가 필요합니다. 기존 Supabase Auth·Storage·Realtime은 전환 검증 전까지 유지합니다.

공식 참고: [River 트랜잭션](https://riverqueue.com/docs/transactional-enqueueing), [River migration](https://riverqueue.com/docs/migrations), [River pooler](https://riverqueue.com/docs/pgbouncer), [Supabase 연결](https://supabase.com/docs/guides/database/connecting-to-postgres), [네이버](https://developers.naver.com/docs/login/devguide/devguide.md), [카카오 설정](https://developers.kakao.com/docs/ko/kakaologin/prerequisite).

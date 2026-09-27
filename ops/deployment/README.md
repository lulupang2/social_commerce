# 키 없는 CI와 테스트 배포

기준: A 통합 커밋 01702b5. 실제 배포와 키 등록은 별도 작업이다.
APP_ENV=test, DB_TARGET=fixture/supabase-test 가드를 유지한다.
운영 환경을 test로 위장하지 않는다.

외부 브라우저에서 보는 키 없는 테스트 사이트는 [공개 미리보기 안내](PREVIEW.md)를 따른다.

## 구성

- compose.ci.yml: 새 격리 PostgreSQL과 이미지 기동 검증. 외부 네트워크/공개 포트 없음.
- compose.deploy.yml: 이미 준비된 Supabase **테스트** 프로젝트용. DB 컨테이너 없음.
- 기존 nhn-rocky/compose.foundation-test.yml: DB fixture 정의만 재사용. 운영 구성이 아님.
- Dockerfile.go: api / worker / migration은 별도 final target과 바이너리.
- Dockerfile.web: pnpm 10.34.5 고정, frozen lockfile, Node 22.13.0.
- 검증 이미지에 소스를 COPY하여 Linux /tmp에서 0600 테스트 실행. Windows 테스트 삭제/skip 없음.
- API/worker/web에 migration 접속 정보를 전달하지 않는다. 모든 앱은 non-root, read-only,
  cap_drop ALL, no-new-privileges, 제한된 tmpfs/메모리/PID로 실행한다.
- 웹은 Docker build 내부에서만 Next standalone 출력을 설정한다. 저장소의 Next 설정은 그대로이며,
  final 이미지에는 추적된 실행 의존성·server.js·정적 파일만 복사한다.

## CI와 동일한 명령

저장소 루트에서 순서대로 실행한다. 실제 .env나 서버 설정 파일을 읽지 않는다.
Linux CI는 .github/workflows/keyless-ci.yml이며 main/master/release/** push, PR, manual 실행이다.
공통 package.json과 lockfile은 수정하지 않았다.

```bash
docker compose -f ops/deployment/compose.ci.yml config --quiet
docker compose --env-file ops/deployment/config-check.env.example -f ops/deployment/compose.deploy.yml config --quiet
docker build --target verification -f ops/deployment/Dockerfile.go -t summergear-ci-go:deployment-ci .
docker run --rm --memory=1g --cpus=2 summergear-ci-go:deployment-ci
python3 ops/deployment/database.py
docker build --target verification -f ops/deployment/Dockerfile.web -t summergear-ci-web:deployment-ci .
docker run --rm --memory=4g --cpus=2 summergear-ci-web:deployment-ci
bash ops/deployment/build-images.sh
python3 ops/deployment/smoke.py
```

database.py와 smoke.py는 매번 고유 프로젝트를 생성하고 finally에서 해당 자원만 제거한다.
기존 fixture 컨테이너·볼륨은 재사용하거나 삭제하지 않는다.
빌드와 통합 테스트를 병렬 실행하지 않는다. 작은 nhn-rocky 서버에서 웹 빌드를 강행하지 않고
CI에서 이미지 빌드 후 전달한다.

check-go.sh는 module verify, vet, race unit, integration 및 integration,authfixture 태그 컴파일을 실행한다.
check-db.sh는 foundation → auth → 공통 fixture runner의 DB 통합 패키지 순서로 검사한다.
fixture runner는 `internal/*/*integration_test.go`가 있는 모듈(현재 jobs, listingimages,
listings, memberdata, notifications, orders, recovery, social)을 자동 선택한다. foundation/auth는
중복 실행하지 않으며, runner가 패키지 실행 전에 격리 DB migration을 적용한다.
integration 태그의 빈 실행은 컴파일 검사이지 실제 DB 검사가 아니다.
check-web.sh는 먼저 @icegear/domain의 dist·타입 선언과 Next route 타입을 생성한 뒤 workspace 전체 typecheck와 @icegear/web test, lint, production build를 수행한다.
실패는 그대로 CI 실패이며 실제 키나 실패 무시 옵션을 요구하지 않는다.

## 키와 설정 경계

| 대상                | 설정 이름                                                                                                                                               | 누락 시                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| API DB              | DATABASE_URL, DATABASE_CONNECTION_MODE, API_DB_MAX_CONNS                                                                                                | URL 누락/역할/TLS 오류면 시작 거부; pool 기본 2                                                                                              |
| worker DB           | RIVER_DATABASE_URL, RIVER_CONNECTION_MODE, WORKER_DB_MAX_CONNS, RIVER_MAX_WORKERS                                                                       | 누락/transaction pooler면 시작 거부; pool 기본 5, worker 기본 1                                                                              |
| migrator DB         | MIGRATION_DATABASE_URL, MIGRATION_DB_MAX_CONNS                                                                                                          | 누락 시 시작 거부; pool 기본 3                                                                                                               |
| 공통                | DB_TARGET_ID                                                                                                                                            | DB environment_guard와 불일치하면 시작 거부                                                                                                  |
| Go Storage          | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY                                                                                                                 | 둘 다 없으면 Storage 비활성, 한쪽만 있으면 시작 거부; 별도 Storage endpoint 변수는 없고 SUPABASE_URL에서 /storage/v1을 파생                  |
| 이미지 옵션         | LISTING_IMAGE_BUCKET, LISTING_IMAGE_SIGNED_URL_TTL_SECONDS                                                                                              | bucket은 listing-images만 허용, TTL 설정은 1~600초 파싱; 현재 서비스 실제 발급은 600초 고정(아래 제한 참고)                                  |
| 임시 로그인/세션    | AUTH_DEV_LOGIN_ENABLED, AUTH_SESSION_IDLE_TTL, AUTH_SESSION_ABSOLUTE_TTL, AUTH_LOGIN_TTL, AUTH_REAUTH_TTL, AUTH_HTTP_TIMEOUT, AUTH_ALLOWED_RETURN_PATHS | 임시 로그인은 테스트 환경에서만 사용; compose 기본 false이나 private env에서 true로 명시 가능                                                |
| Go OAuth            | PUBLIC_WEB_URL, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, NAVER_REDIRECT_URI, KAKAO_CLIENT_ID, KAKAO_CLIENT_SECRET, KAKAO_REDIRECT_URI                      | 불완전한 provider는 비활성; 잘못된 redirect는 거부                                                                                           |
| Expo push           | EXPO_PUSH_ACCESS_TOKEN                                                                                                                                  | 선택값. push access token 검증을 사용하는 Expo 프로젝트에서만 worker private env로 전달한다. Go 세션에 연결된 기기 토큰만 worker가 조회한다. |
| 웹 공개 빌드 값     | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY                                                                                          | 키 없는 모드로 빌드 가능; Supabase 기능 사용 불가                                                                                            |
| 모바일 공개 번들 값 | EXPO_PUBLIC_WEB_URL, EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY                                                                     | 모바일 설정 정책 적용                                                                                                                        |
| 배포                | API_IMAGE, WORKER_IMAGE, MIGRATION_IMAGE, WEB_IMAGE, GATEWAY_PORT                                                                                       | 이미지 필수, 포트 기본 18080                                                                                                                 |

서버 키/DB URL을 NEXT_PUBLIC 또는 EXPO_PUBLIC에 넣지 않는다.
웹 공개 값은 빌드에 포함되므로 런타임 env 변경만으로 교체되지 않는다.
실제 공개 값이 필요한 웹 이미지는 Docker build --build-arg로 두 NEXT_PUBLIC 값만 전달한다.
service-role, OAuth secret, DB 비밀번호는 build args에 절대 전달하지 않는다.
.dockerignore는 .env*, private key, 개발 캐시를 제외한다.
`TOSS_CLIENT_KEY`/`TOSS_SECRET_KEY`는 Go API의 `PAYMENT_MODE=test`에서 쌍으로 검증되지만 현재 Compose는 전달하지 않는다. 실제 테스트 결제사 연결 시 별도 private env 전달과 테스트 키 준비가 필요하며, 키 없는 fixture 결제만으로 외부 승인·취소를 검증한 것으로 보지 않는다.
배포 Compose는 AUTH_DEV_LOGIN_ENABLED 기본값을 false로 두되, 실제 소셜 로그인 연결 전의 격리된 hosted test에서는 private env에서 true로 명시해 기존 임시 로그인 경로를 유지할 수 있다.

Expo push는 migration `0024_push_receipts` 적용 후 dispatch worker가 기기별 ticket을 저장하고,
reconcile worker가 매분 작업을 받아 ticket 생성 15분 뒤부터 receipt를 확인한다. ticket만 받은
알림은 `receipt_pending`이며, `sent`는 Expo receipt `ok`(FCM/APNs 수락)까지만 뜻하고 실기기
표시의 증거는 아니다. receipt 오류·24시간 미확인은 안전한 오류 코드와 함께 `failed`로 운영
복구 화면에 남고 `DeviceNotRegistered` 기기는 비활성화한다. 이전 ticket-only 기록은
receipt가 없으므로 소급해 확인 완료로 처리하지 않는다. 장시간 worker 중단 뒤에는 Expo
receipt 보존 기한(24시간)을 넘긴 ticket의 결과를 알 수 없다.

## 기동·상태·종료·로그

추후 승인된 테스트 배포 시에만 서버의 private 0600 env 파일과 immutable 이미지 digest를 준비한다.
config-check.env.example은 문법 검사 전용 가짜 값이며 접속용이 아니다.
Compose interpolation은 config --quiet로 검사한다. config 전체 출력을 로그에 남기지 않는다.

1. DBA가 테스트 프로젝트 marker, 역할, bootstrap 권한을 먼저 준비한다.
   bootstrap.sql은 fixture에서만 자동 실행된다. 실제 Supabase의 기존 auth/storage를 덮어쓰지 않는다.
2. 백업과 이미지 digest/스키마 기록을 확보하고 새 이미지를 pull한다.
3. migration 단일 서비스가 --apply로 Go 0007 이후 ordered manifest와 River 공식 migration을 실행한다.
   API/worker는 service_completed_successfully 후 시작한다. 실패하면 앱 시작도 차단된다.
4. API /health/ready(DB·auth·listings·images·orders 권한/스키마) 통과 후 web,
   web HTTP 확인 후 gateway가 시작한다.
5. 동일 출처 /api/v1/은 gateway → Go, 나머지는 Next로 전달한다.
   운영용 SUMMERGEAR_GO_API_ORIGIN 빌드 rewrite는 필요 없다.
6. gateway /health/live는 프록시 생존, /health/ready는 Go 준비 상태다.
   web은 자체 HTTP healthcheck로 별도 검사한다.
   worker는 HTTP health가 없으므로 started 로그, River 실행/실패율·최근 작업 완료로 관찰한다.
   프로세스 생존만을 worker 작업 정상 상태로 간주하지 않는다.
7. 종료는 gateway 유입 차단 → web → API/worker SIGTERM 순서다.
   배포 Compose grace 75초는 설정 가능한 최대 60초 drain + worker 강제취소 5초보다 길다.
   fixture는 기본 drain 10초를 사용하여 grace 20초다.
8. stdout/stderr JSON 로그와 제한된 Docker 로그 회전을 사용한다.
   gateway 로그는 method/path/status만 기록하여 OAuth query·서명 token·cookie를 남기지 않는다.

gateway의 호스트 공개는 127.0.0.1뿐이다. 실제 TLS 프록시 연결은 후속이며 이 구성 자체는 TLS를
제공하지 않는다. PUBLIC_WEB_URL은 외부 HTTPS origin과 정확히 일치해야 한다.
Origin과 Cookie는 gateway가 그대로 전달한다. 외부 X-Forwarded-* 신뢰 정책과
TLS 종료 후 proto 전달은 실제 프록시 구성에서 검증해야 한다.

## 백업·복구·롤백

- 변경 전에 migration history/checksum, River 버전, 역할/권한, 이미지 digest와 설정 버전을 기록한다.
- Supabase 플랜의 snapshot/PITR 보존·RPO/RTO를 확인하고 암호화된 별도 백업을 준비한다.
  PostgreSQL custom-format dump는 역할/권한 복구 계획과 함께 확보한다.
  Storage 객체는 DB dump에 포함되지 않으므로 객체 백업/복원도 별도로 준비한다.
- 복원은 운영이 아닌 새 격리 프로젝트에 먼저 수행한다. marker, 역할, 세션, RLS, 이미지 경로와
  River 재시도/중복 실행을 검증한 다음 연결 전환을 결정한다.
- 앱 롤백: 이전 API/worker/web digest를 선택하고 migration은 자동 재실행하지 않는다.
  이전 버전과 현재 DB 스키마가 호환된다는 확인 후
  docker compose --env-file <private-env> -f ops/deployment/compose.deploy.yml up -d --wait --no-deps api worker web
  를 실행하고 gateway 및 앱 health를 재확인한다.
- DB 비호환이면 이미지 롤백만으로 해결하지 않는다. 트래픽/worker를 중지하고 사전 검증된 복원 또는
  forward-fix 절차를 선택한다. 적용 migration을 편집하거나 임의 down SQL을 실행하지 않는다.
- 외부 업로드/PG 효과는 DB rollback만으로 취소되지 않는다. 객체/결제 대조와 보상 작업이 필요하다.
- 운영 환경 가드 해제는 이 작업 범위가 아니다.

## 후속 실제 환경 체크리스트

- [ ] 실제 도메인/TLS/인증서 갱신과 프록시 신뢰 헤더, Secure cookie
- [ ] Supabase 테스트 역할/권한/marker, direct/session pooler, TLS CA, 총 연결 수
- [ ] OAuth redirect, 동의/취소/재인증, 모바일 복귀
- [ ] private Storage bucket, 서명 응답/만료, CORS PUT 및 읽기, 허용 Origin
- [ ] 실제 공개 웹/모바일 설정으로 rebuild 및 노출 키 검토
- [ ] worker 실제 작업 관측·부하·종료·재시작과 리소스 용량
- [ ] 백업을 별도 환경에 복원, 이전 이미지 롤백과 RPO/RTO 실측
- [ ] B/C 최종 커밋을 A가 통합한 결과에서 CI와 smoke 재실행

## 기준 코드의 제한

`01702b5`는 `LISTING_IMAGE_SIGNED_URL_TTL_SECONDS`를 검증하지만 이미지 Service는
`SignedReadTTL`(600초) 상수로 발급한다. 설정값을 낮춰도 발급 시간이 줄지 않는다.
D는 API 로직을 수정하지 않았으며, A/B 통합 시 설정 전달 여부를 결정하고 회귀 검증해야 한다.
Storage 설정이 모두 비어 있어도 DB readiness는 통과한다. 이미지 업로드는 503이며,
health 통과를 실제 Storage 연결 검증으로 간주하지 않는다.

CI는 Buildx의 GitHub Actions layer cache를 Go/Web별로 재사용하고 순차 실행한다.
정적 Go 검사는 `go vet`이며 기존 API 소스 전체 포맷 변경을 섞지 않는다.
GitHub에서 실행하려면 이 커밋이 원격에 반영되어야 한다. 이 작업은 push하지 않는다.

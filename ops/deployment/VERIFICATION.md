# D 배포·CI 검증 기록

기준: `01702b5`, 브랜치 `codex/deployment-ci`, 2026-09-21.
미커밋 배포 초안을 보존·보완했다. B `c3a482a`, C `e907540`은 병합하지 않았다.
애플리케이션 소스·migration·package.json·lockfile 변경은 없다.

## 실행 환경

로컬 Windows에서 Docker Desktop Linux Engine 29.7.2 / Compose v5.3.1을 사용했다.
Go 검증은 Docker 안의 Go 1.27.1, Docker Web 설정은 Node 22.13.0 / pnpm 10.34.5다.
실제 Web 명령은 Docker 장애 후 Windows Node 24.19.0 / pnpm 10.34.5에서 검증했다.
Node 24.19.0은 저장소 engines(>=22.13.0) 조건을 만족한다.
서버의 실제 env 파일·키·운영 DB를 읽거나 배포하지 않았다.
기존 `summergear-ci`, `summergear-ci-dtest` 및 다른 프로젝트 자원은 건드리지 않았다.

## 검증 명령과 결과

저장소 루트에서 실행했다. Dockerfile build는 루트 context `.`를 사용한다.

| 명령 | 결과 |
| --- | --- |
| `docker compose -f ops/deployment/compose.ci.yml config --quiet` | 통과 |
| `docker compose --env-file ops/deployment/config-check.env.example -f ops/deployment/compose.deploy.yml config --quiet` | 통과, 가짜 설정만 사용 |
| `rhysd/actionlint:1.7.7 -color .github/workflows/keyless-ci.yml` (read-only repo mount) | 통과 |
| `docker build --target verification -f ops/deployment/Dockerfile.go -t summergear-ci-go:deployment-ci .` | 통과, api/worker/migrate/sample 바이너리 빌드 |
| `docker run --rm --memory=1g --cpus=2 summergear-ci-go:deployment-ci` | module verify, vet, race unit, integration 및 integration,authfixture 컴파일 통과 |
| `python ops/deployment/database.py` | foundation·auth·listings·listingimages DB/RLS 모두 통과 |
| `docker build --target verification -f ops/deployment/Dockerfile.web -t summergear-ci-web:deployment-ci .` | 미완료: npm ECONNRESET 재시도 중 Docker/WSL 무응답 발생, 이번 빌드 client만 종료 |
| `docker run --rm --memory=4g --cpus=2 summergear-ci-web:deployment-ci` | 미실행: 앞선 이미지 빌드 미완료 |
| `pnpm --filter @icegear/domain build` / `pnpm --filter @icegear/web exec next typegen` / `pnpm typecheck` | 로컬 통과 |
| `pnpm --filter @icegear/web test` / `lint` / `build` | 로컬 통과: 웹 테스트 5개, lint, production build |
| `node apps/web/node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1 --port <가용 포트>` | 로컬 첫 화면 HTTP 200 확인 후 이번 프로세스 종료 |
| API/worker/migration/Web final target build | 이번 실행에서 미검증: Docker 데몬 장애로 차단. 기존 이미지 존재를 이번 통과로 간주하지 않음 |
| `python ops/deployment/smoke.py` | 실패: Docker info 사전 검사에서 15초 timeout, 자원 생성 전 종료 |

DB 실행은 `summergear-db-a4fd0be6580d` 고유 프로젝트를 생성하고 종료 후 해당 컨테이너·볼륨·네트워크만 제거했다.
통합 테스트는 실제 PostgreSQL fixture 및 가짜 외부 제공자를 사용했다. 실제 Supabase/OAuth 검증이 아니다.
기존 `test-listings-database.sh`는 전체 소스를 gofmt/tidy하는 prepare를 포함하므로 D에서는 실행하지 않았다.
대신 같은 `listings`·`listingimages` integration 패키지를 `check-db.sh`로 Linux에서 실행했고,
foundation/인증 integration도 추가 실행했다. 검증 범위를 줄이거나 테스트를 skip하지 않았다.

## 정적 대조

- Git Bash `bash -n`으로 배포 shell 4개 문법 통과.
- Workflow YAML 파싱, PR/push/manual 이벤트, Dockerfile 경로, package scripts 존재 확인.
- 코드에서 읽는 Go 설정 35개와 env example/서비스별 Compose 설정 대조 통과.
  `FIXTURE_FAST_JOBS`는 배포에서 의도적으로 전달하지 않는다.
- B/C 커밋의 변경 경로와 D 소유 파일이 겹치지 않는다.
- 임시 로그인은 기존 구현 유지. hosted test의 private env에서 명시적으로 켤 수 있고,
  smoke fixture는 활성화하여 동일 출처/쿠키/CSRF 전달을 검사하도록 작성했다.
  이번 실행에서는 Docker 장애로 이 smoke 검증까지 도달하지 못했다.

## CI 구조

PR, main/master/release/** push와 manual 실행에서 단일 Linux job을 순차 실행한다.
Go module download/verify, vet/race/integration compile, 격리 DB, workspace typecheck,
웹 test/lint/build, 역할별 final 이미지 build와 smoke를 포함한다.
Buildx GHA layer cache를 Go/Web별로 분리하며 실제 secret은 필요 없다.
GitHub Actions 서버에서 workflow가 실행된 기록은 아니다. 원격 push는 하지 않았다.

## 배포 구조와 한계

hosted Supabase **테스트** 환경만 지원한다. APP_ENV/DB_TARGET 운영 차단을 해제하지 않았다.
Web·API·worker·migration을 별도 multi-stage target으로 제공한다.
Web은 Docker build 안에서 standalone을 생성하고 실행 의존성만 복사한다.
서버는 Docker Compose와 기존 TLS proxy를 사용하며 gateway는 loopback에만 바인딩한다.
DB 역할과 Storage service credential은 역할별 runtime env로 분리한다.

`LISTING_IMAGE_SIGNED_URL_TTL_SECONDS`는 파싱되지만 기준 API 서비스 발급은 600초 고정이다.
A/B가 설정 전달을 정렬할 필요가 있다. API readiness는 Storage 실연결 성공을 뜻하지 않는다.
Go auth의 IP 제한기는 현재 forwarded IP를 신뢰하지 않으므로 gateway 단위 제한을 별도 검증해야 한다.

## 최종 통합 후 확인

A가 B/C를 통합한 결과에서 이 workflow와 smoke를 다시 실행한다.
특히 C의 Next 설정이 바뀌면 Dockerfile의 standalone 패키징을 함께 확인하고,
B의 복구/동시성 테스트가 DB job에 포함되어 실행되는지 확인한다.
직접 충돌 예상 파일은 없으나 `.github/**`, `ops/**`, env example과 `docs/deployment.md`를
다른 통합 작업에서 수정했다면 수동 비교가 필요하다.

실제 NHN 서버 설치·기동, TLS 도메인·인증서, Supabase 역할/pooler/CA,
private Storage bucket/CORS/서명 응답, 실제 소셜 로그인과 모바일 실기기,
백업 복원·이전 이미지로 운영 복구 연습은 미검증 후속 작업이다.

## Docker 장애와 재검증

Go·DB·Compose·actionlint 완료 후 Web 의존성 설치 중 Next tarball 다운로드가 ECONNRESET으로
재시도되었다. 이후 Docker `_ping`은 500 또는 timeout, `docker info`는 15~20초 timeout,
WSL 호출은 `Wsl/Service/0x8007274c`로 실패했다. 원인은 확정하지 않았다.
다른 프로젝트 컨테이너를 보호하기 위해 Docker Desktop/WSL 재시작, 기존 자원 삭제를 하지 않았다.
이번 Web build client(PID 19292, 부모 docker PID 31208)만 명령행·부모를 확인 후 종료했다.

[실행 안내](README.md)의 Web verification build/run → `build-images.sh` → `smoke.py`를
Docker가 정상인 환경에서 순차 재실행해야 한다. standalone/non-root/프록시 DNS 재연결/
임시 로그인/정상 종료는 구성과 검사 코드를 작성했으나 Docker runtime 통과로 보고하지 않는다.
Linux Web 검사와 final 이미지/기동 검증이 남아 있으므로 D 전체 인수 검증 완료 상태는 아니다.

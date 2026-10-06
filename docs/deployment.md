# nhn-rocky 배포·테스트 환경

현재 `sg.jisung.lol` preview의 **웹 자동배포**는 [GitHub Actions 웹 배포 안내](../ops/deployment/WEB-DEPLOY.md)를 따른다.
`main`의 Keyless Linux CI 성공 후 GHCR 이미지 게시 → SSH 웹 교체를 수행한다.
SSH 최초 설정과 `WEB_DEPLOY_ENABLED=true`가 필요하다. 아래 hosted Supabase 배포 절차와 별개이며,
preview의 API/worker/DB/migration은 웹 자동배포에서 변경하지 않는다.

상태: 키 없는 Linux CI·역할별 이미지·테스트 배포 Compose 추가, 실제 배포 전 · 기준일: 2026-09-21

실행 명령, 환경변수 경계, 기동·종료와 백업/롤백은 [배포·CI 실행 안내](../ops/deployment/README.md)를 따른다. 검증 결과와 미해결 항목은 [D 검증 기록](../ops/deployment/VERIFICATION.md)에 기록한다. `compose.deploy.yml`은 Supabase 테스트 전용이며 운영 차단 가드를 유지한다.

Go API·River worker·Next.js를 SSH 호스트 `nhn-rocky`에서 배포·테스트합니다. DB는 Supabase PostgreSQL을 유지합니다. Docker 운영 DB 계획은 [ADR 005](adr/005-supabase-river-toss-test.md)로 대체되었습니다.

## 확인한 환경

2026-09-18 읽기 전용 SSH 확인 결과입니다. 서비스 변경이나 배포를 수행한 기록은 아닙니다. 배포 직전에 다시 확인합니다.

| 항목             | 관측값                                       |
| ---------------- | -------------------------------------------- |
| OS               | Rocky Linux 9.8                              |
| Docker / Compose | 29.8.0 / v5.5.1, SSH 사용자 실행 가능        |
| RAM              | 약 1.9GiB, 당시 available 약 642MiB          |
| Swap             | 약 2GiB, 당시 약 623MiB 사용                 |
| 루트 디스크      | 약 19GiB, 당시 가용 약 11GiB                 |
| 기존 서비스      | 다른 프로젝트의 web·api·worker·Redis 실행 중 |

기존 서비스의 컨테이너·네트워크·포트·Redis를 임의 공유하거나 변경하지 않습니다. 빌드·테스트는 순차 실행하고 메모리·디스크 사용량과 기존 서비스 지연을 관찰합니다. 필요시 증설을 결정하며 Swap을 RAM 대체로 간주하지 않습니다.

## 목표 배포

| 구성          | 위치·책임                                                                  |
| ------------- | -------------------------------------------------------------------------- |
| gateway       | nhn-rocky, TLS·동일 출처 `/api/v1` 라우팅; 기존 프록시 연계는 조사 후 결정 |
| web           | nhn-rocky, Next.js 운영 서버                                               |
| api           | nhn-rocky, Go + Fiber, 네이버·카카오 로그인과 거래 API                     |
| worker        | nhn-rocky, River 작업 실행; API와 별도 프로세스                            |
| PostgreSQL    | Supabase 호스팅 유지, 업무 데이터·River 큐 저장                            |
| 테스트 실행기 | nhn-rocky, 테스트할 때만 실행                                              |

Compose를 앱 배포 기본안으로 둡니다. 운영용 PostgreSQL·Redis 컨테이너는 추가하지 않습니다. 도메인·포트·원격 저장소 경로·배포 디렉터리와 이미지 버전은 실제 구현 전에 확인합니다.

## 실제 배포 방식

애플리케이션은 Docker Compose로 실행합니다. nhn-rocky 호스트에 Node.js나 Go toolchain을 설치할 필요는 없습니다. 빌드와 검증은 CI 또는 여유 자원이 있는 빌더에서 수행하고, 서버에는 immutable image tag 또는 가능하면 digest를 전달합니다. 현재 서버는 자원이 작으므로 API/worker/web 이미지를 서버에서 병렬 빌드하지 않습니다.

필수 도구는 Git, Docker Engine, Docker Compose plugin, curl입니다. 배포 전 아래 명령이 모두 성공하는지 확인합니다.

```sh
git --version
docker --version
docker compose version
curl --version
```

저장소 기본 위치는 `/home/rocky/projects/socialapp`, private 서버 설정은 `/home/rocky/.config/summergear/test.env`입니다. 기존 파일을 덮어쓰지 않도록 최초 1회만 다음 준비 스크립트를 사용할 수 있습니다.

```sh
cd /home/rocky/projects/socialapp
bash ops/nhn-rocky/prepare-env.sh
chmod 700 /home/rocky/.config/summergear
chmod 600 /home/rocky/.config/summergear/test.env
```

현재 배포 Compose는 **hosted Supabase test 전용**입니다. `APP_ENV=test`, `PAYMENT_MODE=test`, `DB_TARGET=supabase-test` 가드를 유지하며 production 선택을 허용하지 않습니다.

## 환경변수와 비밀 경계

Go API·worker·migration에 필요한 실제 이름은 `ops/nhn-rocky/.env.example`을 기준으로 합니다. 역할별 DB URL은 각각 `DATABASE_URL`, `RIVER_DATABASE_URL`, `MIGRATION_DATABASE_URL`이며 서로 다른 최소 권한 계정을 사용합니다. `DB_TARGET_ID`는 DBA가 만든 `summergear_meta.environment_guard` marker와 일치해야 합니다.

이미지 Storage는 Go API만 사용합니다.

- `SUPABASE_URL`: Supabase 프로젝트 origin. 별도 Storage endpoint 변수는 없고 API가 `/storage/v1`을 파생합니다.
- `SUPABASE_SERVICE_ROLE_KEY`: 서버 전용. Web/Expo 또는 Docker build argument로 전달하지 않습니다.
- `LISTING_IMAGE_BUCKET`: 현재 구현은 `listing-images`만 허용합니다.
- `LISTING_IMAGE_SIGNED_URL_TTL_SECONDS`: 1~600초를 파싱하지만 기준 코드의 실제 발급은 600초 상수입니다. 설정 전달은 A/B 통합 후 확인해야 합니다.

실제 네이버·카카오 연결은 아직 보류 상태입니다. `AUTH_DEV_LOGIN_ENABLED`은 기본 `false`지만, 격리된 test 배포에서 기존 임시 로그인을 유지해야 할 때 private env에서 `true`로 명시할 수 있습니다. Go 설정 자체가 test DB 대상만 허용합니다. 실제 OAuth를 켜면 `PUBLIC_WEB_URL`과 각 provider의 CLIENT_ID/CLIENT_SECRET/REDIRECT_URI를 함께 설정합니다.

웹 공개 Supabase 값은 런타임 secret이 아니라 **build-time public 값**입니다. 필요한 경우 Web 이미지를 다음처럼 빌드합니다.

```sh
docker build --target web -f ops/deployment/Dockerfile.web \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  -t "${WEB_IMAGE:?set an immutable registry image tag}" .
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY`는 기존 코드의 호환 fallback이지만 새 배포는 publishable key 이름을 사용합니다. `SUMMERGEAR_GO_API_ORIGIN`은 개발 시 Next rewrite용이며, 배포에서는 gateway가 동일 출처 `/api/v1`을 Go로 전달하므로 설정하지 않습니다.

## 이미지와 migration 배포

키 없는 검증 이미지는 `ops/deployment/build-images.sh`로 만들 수 있습니다. 실제 hosted test 배포에는 registry의 immutable image reference를 private env의 `API_IMAGE`, `WORKER_IMAGE`, `MIGRATION_IMAGE`, `WEB_IMAGE`에 기록합니다. 비밀값은 Dockerfile의 ARG/ENV로 bake하지 않습니다.

배포 직전에는 Compose 보간만 검사하고 전체 config를 로그로 출력하지 않습니다.

```sh
cd /home/rocky/projects/socialapp
ENV_FILE=/home/rocky/.config/summergear/test.env
docker compose --env-file "$ENV_FILE" -f ops/deployment/compose.deploy.yml config --quiet
docker compose --env-file "$ENV_FILE" -f ops/deployment/compose.deploy.yml pull
```

DB migration은 API/worker가 아니라 단일 migration 서비스가 수행합니다. 적용 전에 Supabase backup/PITR 상태와 현재 migration checksum을 기록합니다.
DBA bootstrap 이후 현재 이력을 읽기 전용으로 확인할 수 있습니다.

```sh
docker compose --env-file "$ENV_FILE" -f ops/deployment/compose.deploy.yml \
  run --rm --no-deps migration --apply=false
```


```sh
docker compose --env-file "$ENV_FILE" -f ops/deployment/compose.deploy.yml up --abort-on-container-exit --exit-code-from migration migration
```

migration이 성공한 뒤 앱을 기동합니다.

```sh
docker compose --env-file "$ENV_FILE" -f ops/deployment/compose.deploy.yml \
  up -d --wait api worker web gateway
```

API와 worker가 자체적으로 migration을 수행하지 않습니다. migration 실패 시 앱 기동을 강행하지 않습니다.

## reverse proxy와 health

내부 gateway는 기본적으로 `127.0.0.1:18080`에만 바인딩합니다. 외부 HTTPS는 서버의 기존 TLS reverse proxy가 이 loopback 포트로 전달하도록 연결합니다. `PUBLIC_WEB_URL`은 브라우저가 실제로 접근하는 외부 HTTPS origin과 정확히 같아야 합니다.

기동 확인:

```sh
curl -fsS http://127.0.0.1:18080/health/live
curl -fsS http://127.0.0.1:18080/health/ready
docker compose --env-file "$ENV_FILE" -f ops/deployment/compose.deploy.yml ps
```

`/health/live`는 gateway 생존, `/health/ready`는 Go API의 DB·권한·스키마 준비 상태를 확인합니다. worker는 HTTP health endpoint가 없으므로 로그와 River 작업 상태를 함께 봅니다.

## 로그·재시작·종료

```sh
docker compose --env-file "$ENV_FILE" -f ops/deployment/compose.deploy.yml \
  logs -f --tail=200 api worker web gateway

docker compose --env-file "$ENV_FILE" -f ops/deployment/compose.deploy.yml restart api worker web gateway
```

전체 종료가 필요한 경우 외부 proxy 유입을 먼저 차단한 뒤 gateway/web/API/worker 순으로 종료합니다. 배포 Compose의 75초 grace period가 애플리케이션 drain 시간보다 길게 설정되어 있습니다.

```sh
docker compose --env-file "$ENV_FILE" -f ops/deployment/compose.deploy.yml stop gateway web api worker
```

## 업데이트 배포

1. 현재 commit, image digest, private env의 이미지 참조, migration 상태를 기록합니다.
2. 새 Compose/문서가 포함된 commit으로 저장소를 갱신합니다.
3. 새 immutable image reference를 private env에 반영합니다.
4. `config --quiet` → `pull` → backup 확인 → migration → `up -d --wait` 순서로 실행합니다.
5. live/ready, 웹 첫 화면, `/api/v1/auth/providers`, 이미지 업로드/서명 URL 경로를 확인합니다.

작은 nhn-rocky 서버에서는 빌드와 통합 테스트를 동시에 실행하지 않습니다. 가능하면 CI에서 이미지 생성까지 끝낸 뒤 서버는 pull과 기동만 수행합니다.

## rollback

앱 롤백은 private env의 `API_IMAGE`, `WORKER_IMAGE`, `WEB_IMAGE`를 직전 검증 digest로 되돌린 뒤 실행합니다.

```sh
docker compose --env-file "$ENV_FILE" -f ops/deployment/compose.deploy.yml \
  up -d --wait --no-deps api worker web
```

migration을 임의로 down하거나 적용된 SQL을 수정하지 않습니다. 이전 이미지가 현재 DB 스키마와 호환되지 않으면 트래픽과 worker를 멈추고 검증된 DB 복원 또는 forward-fix 절차를 사용합니다. Storage 객체는 PostgreSQL dump에 포함되지 않으므로 별도 복원 계획이 필요합니다.

## 장애 시 기본 확인 순서

1. `docker compose ... config --quiet`: 필수 변수 누락·보간 오류.
2. `docker compose ... ps`: migration exit code와 각 health 상태.
3. `docker compose ... logs --tail=200 migration api worker web gateway`: 값 자체를 출력하지 않고 오류 종류 확인.
4. `/health/ready`: DB 역할·TLS·marker·migration·RLS/schema 문제 확인.
5. Web만 실패하면 image build-time public 설정과 gateway→web health를 확인.
6. 이미지 API만 실패하면 `SUPABASE_URL`/service-role pair, private `listing-images` bucket, Storage CORS, signed URL origin/TTL을 확인.
7. 외부에서만 실패하면 TLS proxy의 Host/X-Forwarded-Proto와 `PUBLIC_WEB_URL` 일치를 확인.


## Supabase 연결

Go는 Supabase REST API용 publishable key가 아닌 PostgreSQL 연결 정보로 접속합니다. migration·API·worker 계정을 분리하고 필요한 DB 권한만 부여합니다. 비밀번호가 포함된 연결 문자열은 서버 비밀 설정에 저장하고 로그·문서·채팅에 출력하지 않습니다.

직접 연결 또는 session pooler를 우선 검증합니다. nhn-rocky의 네트워크·IPv4/IPv6·TLS·프로젝트 연결 수 제한을 확인합니다. River coordinator의 `LISTEN/NOTIFY` 연결에 transaction pooler를 그대로 사용하지 않습니다. API만 transaction pooling을 쓰는 경우에도 준비된 문장·트랜잭션 설정과 드라이버 호환성을 검증합니다. [Supabase 연결 문서](https://supabase.com/docs/guides/database/connecting-to-postgres), [River 연결 문서](https://riverqueue.com/docs/pgbouncer)

API·worker의 총 연결 수와 낮은 초기 worker 동시성을 설정해 부하를 측정합니다. River 스키마를 공개 Data API에 노출하지 않고 브라우저 역할에는 읽기·쓰기 권한을 주지 않습니다.

## 운영과 테스트 분리

기본안은 테스트 전용 Supabase 프로젝트입니다. 테스트 앱·worker는 이 프로젝트만 사용하고 운영 연결 정보를 전달받지 않습니다. 결제는 토스페이먼츠 테스트 키, 알림은 테스트 수신처만 사용합니다.

테스트 코드는 nhn-rocky에서 실행하고 테스트 DB는 별도 Supabase에 연결합니다. 파괴적·반복 DB 테스트에 일회성 Docker DB를 사용할 수 있지만 이는 운영 DB 이전과 별개입니다. 해당 테스트가 Supabase의 auth·storage 스키마에 의존하면 호환 테스트 스택을 준비하거나 전용 Supabase 테스트 환경에서 검증합니다. 순정 PostgreSQL에 기존 SQL을 그대로 실행하지 않습니다.

테스트 앱과 운영 앱은 도메인·컨테이너·환경변수·큐 DB를 분리합니다. 큐 이름만 다르게 두고 같은 운영 데이터에 접근하는 것으로 격리를 대신하지 않습니다. 파괴적 테스트는 대상 환경을 검증하고 해당 실행 자원만 정리합니다.

## 스키마와 인증 전환

앱 변경은 `supabase/migrations`에 추가합니다. River 공식 migration은 고정한 라이브러리 버전과 적용 기록을 따로 관리하고 배포 시 일회성 단계에서 실행합니다. API·worker가 동시에 migration을 수행하지 않습니다.

DB 호스팅은 유지하지만 Go 인증으로 바꾸기 위해 `auth.users` FK·삭제 전파, `auth.uid()`·RLS, Storage·Realtime의 사용자 인증 의존성을 점검해야 합니다. 기존 사용자 ID와 데이터를 보존하면서 이전하고 기존 Auth 사용자를 먼저 삭제하지 않습니다. Go 세션이 기존 Supabase 서비스에 자동 인식되지는 않습니다.

Storage·Realtime의 호스팅 변경은 이번 결정에 포함하지 않습니다. 해당 기능을 계속 사용할 경우 Go 인증과의 안전한 연계 방식을 확정하고 검증해야 합니다.

## 배포·복구 순서

1. 원격 저장소·커밋·미커밋 변경을 확인합니다. 로컬 문서가 원격에 자동 동기화되었다고 가정하지 않습니다.
2. 테스트 전용 연결·키로 migration과 가상 시드를 적용합니다.
3. nhn-rocky에서 Go 단위·통합 테스트, 권한·세션·재고 경쟁·River 재시도, 웹 검사·빌드를 순차 실행합니다.
4. 테스트 도메인에 배포해 OAuth·토스페이먼츠 승인·조회·취소·웹훅을 확인합니다. 모바일 복귀는 실제 기기에서도 검증합니다.
5. 커밋·이미지·실행 명령·환경·결과를 기록합니다. 이번 목표는 테스트 배포이며 실결제·실지급을 켜지 않습니다.

Supabase 플랜별 백업·복구 기능을 확인하고 중요한 스키마 변경 전에 별도 복원 검증을 합니다. 파괴적 migration을 피하고 앱 이전 버전과 데이터 호환성을 확보합니다. 외부 PG 결과는 DB rollback으로 되돌아가지 않으므로 대조 작업으로 복구합니다.

## 준비할 정보

원격 저장소 경로, 테스트 도메인, Supabase 테스트 프로젝트·연결 설정 파일 위치, 소셜 앱·PG 테스트 키 준비 여부가 필요합니다. 구체적인 사용자 준비 사항은 [테스트 결제 준비](payment-test-setup.md)를 따릅니다.

## 원격 작업 환경 준비

저장소와 비밀 설정 파일을 준비하는 절차는 [nhn-rocky 작업 환경](../ops/nhn-rocky/README.md)에 있습니다. 준비 브랜치는 `codex/nhn-rocky-setup`, 원격 경로는 `/home/rocky/projects/socialapp`입니다. Go·River 기반의 격리 실행은 [기반 안내](../ops/nhn-rocky/FOUNDATION.md), 실행 결과와 한계는 [검증 기록](foundation-verification.md)을 따릅니다. 실제 Supabase 테스트 연결과 운영 배포는 별도 단계입니다.

## 새 Rocky 서버 준비와 TLS 연결 예시

아래는 운영자가 새 서버에서 수행할 절차다. 이번 작업에서는 서버에 실행하지 않았다.
기존 nhn-rocky에는 Docker/Compose가 있으므로 재설치하거나 서비스를 재시작하지 않는다.
새 서버는 조직에서 관리하는 Docker Engine·Compose plugin을 먼저 설치하고,
Docker 사용 권한이 있는 배포 계정에서 위 버전 확인을 통과시킨다.

```sh
sudo dnf install -y git curl
# Docker Engine/Compose가 설치된 새 서버에서만 수행
sudo systemctl enable --now docker
```

빌더에는 Docker/Compose와 Python 3가 필요하며 Go 1.27.1, Node 22.13.0,
pnpm 10.34.5는 Dockerfile에 고정되어 있다. 서버는 registry pull 권한만 준비한다.
SELinux는 끄지 않는다. nginx 설정 bind mount는 `:ro,z`로 공유 라벨을 지정한다.
별도 Supabase CA가 필요하면 각 Go 서비스에 CA 파일을 read-only로 마운트하고
DSN의 `sslrootcert`를 그 컨테이너 경로로 지정한다. 호스트 경로만 DSN에 쓰면 동작하지 않는다.

기존 호스트 Nginx가 TLS를 종료하는 경우 해당 테스트 도메인의 HTTPS server 블록에
다음을 적용한다. 인증서 경로·도메인·80→443 리다이렉트는 기존 서버 설정을 따른다.
외부 proxy가 컨테이너라면 그 컨테이너의 127.0.0.1은 호스트가 아니므로 별도 연결 설계가 필요하다.

```nginx
location / {
    proxy_pass http://127.0.0.1:18080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_buffering off;
    proxy_read_timeout 60s;
}
```

설정 적용 전 `sudo nginx -t`를 통과시킨 뒤 `sudo systemctl reload nginx`로 반영한다.
외부 proxy는 들어온 X-Forwarded-Proto를 그대로 신뢰하지 않고 위처럼 덮어쓴다.
내부 gateway는 Docker DNS를 다시 조회하여 업데이트·롤백 중 바뀐 API/Web 주소를 반영한다.
Go 인증 제한기는 전달된 X-Forwarded-For를 신뢰하지 않아 gateway 단위로 제한될 수 있다.
실제 부하·프록시 신뢰 설정은 인증 담당과 검증한다.

Compose 프로젝트 이름은 `summergear-hosted-test`로 고정되어 checkout 경로 변경에도 유지된다.
업데이트 전 현재 경로에서 `git status --short --branch`, `git log -1 --oneline`을 확인한다.
이미지 전송은 승인된 registry를 사용하고, 공개 Web build 값과 private runtime 설정을 분리한다.
DBA는 [기반 안내](../ops/nhn-rocky/FOUNDATION.md)의 신규 테스트 역할·marker 준비를 먼저 수행한다.
Go migrator는 0007 이후 Go migration과 River 이력만 관리하며 이전 Supabase migration이나
Storage bucket을 자동 생성하지 않는다. 기존 auth/storage 스키마를 fixture bootstrap으로 대체하지 않는다.

private env는 `source`하지 않고 Compose `--env-file`로만 읽는다. 비밀번호는 DSN URL 인코딩을
적용하며 `$`를 포함한 literal 값은 Compose 해석에 맞게 작은따옴표로 감싼다.
`TOSS_*`는 미래 결제 설정 자리표시자로 현재 코드/Compose가 사용하지 않는다.

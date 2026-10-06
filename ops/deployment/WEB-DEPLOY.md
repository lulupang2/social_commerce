# GitHub Actions 웹 자동배포

`main` push → `Keyless Linux CI` 성공 → `Publish and deploy web` 순서다.
두 번째 workflow가 검증된 커밋의 웹 이미지를 GHCR에 게시하고, 설정을 활성화한 경우
SSH로 기존 `summergear-preview`의 웹만 교체한다. 서버에서 빌드하거나 Git pull하지 않는다.
API/worker/DB/migration 배포는 포함하지 않는다. 웹이 현재 API와 호환되는 변경에 사용한다.
애플리케이션 smoke는 실행하지 않는다. 컨테이너 health와 gateway의 웹 HTTP 응답은 배포 완료 조건이다.

## 최초 서버 준비

기존 배포 계정 `rocky`로 진행한다. Docker/Compose, Bash, `flock`이 필요하다.
배포용 SSH 공개키를 이 계정의 `~/.ssh/authorized_keys`에 추가한다. 기존 키를 덮어쓰지 않는다.
배포 계정은 Docker를 실행할 수 있어야 하며 Actions runner에서 SSH 포트에 접근할 수 있어야 한다.

다음 파일을 새로 만든다. 기존 `test.env`와 별도이며 결제/DB 키를 복사하지 않는다.
이미 파일이 있다면 현재 값을 확인하고 수정한다.

```bash
install -d -m 700 "$HOME/.config/summergear"
config="$HOME/.config/summergear/web-deploy.env"
if [ ! -e "$config" ]; then
  (umask 077; cat > "$config" <<'EOF'
DEPLOY_DIR=/home/rocky/projects/summergear-deploy-4ebb2b6
PUBLIC_WEB_URL=https://sg.jisung.lol
GATEWAY_PORT=18080
EOF
  )
fi
chmod 600 "$config"
```

위 경로는 사용자가 확인한 현재 웹 배포 위치다. `DEPLOY_DIR` 안의
`ops/deployment/compose.ci.yml`과 `compose.preview.yml`을 사용한다.
현재 웹 컨테이너의 Compose 파일 목록이 이 두 파일과 다르면 자동배포는 중단한다.
Toss overlay는 현재 API/worker 설정이며 웹 교체 시 적용하지 않는다.
기존 API/worker 컨테이너를 재생성하거나 전체 Compose `up`을 실행하지 않는다.

## GitHub 최초 설정

저장소 Settings → Secrets and variables → Actions에 다음 **Repository secrets**를 등록한다.
개인키와 토큰은 채팅이나 저장소에 넣지 않는다.

| Secret | 값 |
| --- | --- |
| `DEPLOY_HOST` | Actions에서 접근 가능한 서버 IPv4 주소 또는 DNS 이름 |
| `DEPLOY_USER` | `rocky` |
| `DEPLOY_SSH_KEY` | 위 공개키에 대응하는 배포 전용 OpenSSH 개인키 전체(비대화형 사용 가능) |
| `DEPLOY_KNOWN_HOSTS` | 검증한 서버의 known_hosts 행. 22번 이외 포트는 `[호스트]:포트` 형식 |

서버 호스트 키는 서버 콘솔에서 `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`로 확인한다.
클라이언트에서 `ssh-keyscan -t ed25519 -p <포트> <호스트>`로 수집한 키의 지문을 비교한 뒤 등록한다.
워크플로는 StrictHostKeyChecking을 켜며, 매 실행마다 검증 없이 키를 수집하지 않는다.

**Repository variables**:

| Variable | 값 |
| --- | --- |
| `WEB_DEPLOY_ENABLED` | 서버와 Secrets 준비 후 `true`로 설정. 누락/다른 값이면 이미지 게시까지만 수행 |
| `DEPLOY_PORT` | SSH 포트. 생략하면 `22` |

`preview-web` GitHub Environment의 필수 승인 설정이 있으면 배포 전 승인 대기 상태가 된다.
완전 자동 실행을 원하면 해당 Environment에 필수 승인을 설정하지 않는다.

GHCR 업로드는 publish job의 `GITHUB_TOKEN`(`packages: write`)을 사용한다.
서버 pull에는 deploy job의 수명이 짧은 `GITHUB_TOKEN`(`packages: read`)을 SSH 표준입력으로 전달한다.
서버의 임시 Docker 인증 폴더는 종료 시 삭제한다. 별도 PAT나 서버의 영구 registry 로그인이 필요 없다.
기존 동일 이름의 GHCR 패키지가 있다면 이 저장소에 Actions 접근 권한을 부여해야 한다.
이미지 공개 여부는 변경하지 않는다. 웹 공개 Supabase build args는 기존 keyless CI와 동일하게 비어 있다.

## 실행과 확인

최초 설정 후 `main`에 push하거나 Actions → Keyless Linux CI → Run workflow에서 `main`을 선택한다.
CI가 성공하면 `Publish and deploy web`이 자동 시작한다. 이미지 게시까지 끝난 실행에서
Secrets/변수만 나중에 설정했다면 해당 `Publish and deploy web` 실행을 Re-run all jobs해도 된다.
`main`의 최신 커밋이 아닌 이전 실행은 게시/배포 직전에 확인하여 건너뛴다.
PR, master, release 브랜치는 서버 배포 대상이 아니다.

- 이미지 태그: `ghcr.io/lulupang2/social_commerce/web:<전체 커밋 SHA>`
- 실제 배포: build 결과의 `@sha256:...` digest를 사용한다.
- GitHub 배포 workflow의 `publish`와 `deploy`가 모두 성공했는지 확인한다.
  `deploy`가 skipped이면 서버 반영이 완료된 것이 아니다. publish 요약에 설정 안내가 표시된다.
- 서버에는 `~/.local/state/summergear/web-deploy/current-image.env`에 현재 이미지,
  `previous-image.env`에 직전 이미지가 기록된다. 권한은 600이다.

서버는 배포 잠금으로 동시 교체를 막고 `--no-deps --pull never --wait`로 웹만 교체한다.
gateway는 컨테이너 재시작 대신 Nginx reload로 새 웹 주소를 반영한다.
새 웹 health 또는 gateway 웹 응답이 실패하면 직전 로컬 이미지로 복구하고 Actions는 실패로 표시한다.
SSH 강제 종료/서버 전원 장애처럼 복구 코드를 실행할 수 없는 상황은 수동 확인이 필요하다.
컨테이너 교체 중 짧은 접속 오류가 발생할 수 있으며 무중단 배포를 보장하지 않는다.
이미지/볼륨 자동 정리는 하지 않는다.

## 수동 롤백

기존 로컬 이미지로 복구하므로 registry 인증이 필요 없다. 서버의 같은 배포 계정에서 실행한다.

```bash
(
  set -e
  source "$HOME/.config/summergear/web-deploy.env"
  export PUBLIC_WEB_URL GATEWAY_PORT
  state="$HOME/.local/state/summergear/web-deploy"
  exec 9> "$state/deploy.lock"
  flock -w 600 9
  source "$state/previous-image.env"
  export WEB_IMAGE
  docker compose -p summergear-preview \
    -f "$DEPLOY_DIR/ops/deployment/compose.ci.yml" \
    -f "$DEPLOY_DIR/ops/deployment/compose.preview.yml" \
    -f "$state/compose.web.yml" \
    up -d --no-deps --pull never --wait --wait-timeout 120 web
  docker exec summergear-preview-gateway-1 nginx -s reload
  docker exec summergear-preview-gateway-1 wget -q -O /dev/null http://127.0.0.1:8080/
  cp "$state/previous-image.env" "$state/current-image.env"
)
```

수동으로 현재 웹을 관리할 때도 위 세 Compose 파일과 `current-image.env`의 `WEB_IMAGE`를 사용한다.
예전 기본 이미지 태그로 되돌아가지 않도록 전체 Compose `up` 명령과 혼용하지 않는다.

## 코드 검증

```bash
bash -n ops/deployment/deploy-web.sh ops/deployment/deploy-web-ssh.sh
python3 ops/deployment/test_deploy_web.py
```

이 검사는 가짜 Docker CLI로 실패/복구와 변경 범위를 확인하며 실제 서버에 접속하지 않는다.
실제 SSH, GHCR 권한, 기존 서버의 Compose 호환성은 최초 배포 결과에서 별도로 확인해야 한다.

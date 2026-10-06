# 공개 테스트 미리보기

현재 웹 업데이트는 [GitHub Actions 웹 자동배포](WEB-DEPLOY.md)를 사용할 수 있다.
아래 과거 배포 이미지 태그보다 서버의 `~/.local/state/summergear/web-deploy/current-image.env`가
있으면 그 이미지 기록을 우선 사용한다.

이미 빌드한 `summergear-{web,api,worker,migration}:deployment-ci` 이미지를
`compose.ci.yml` + `compose.preview.yml`로 지속 실행한다.
구조는 브라우저 HTTPS → 호스트 Caddy → loopback gateway → Next.js / Go API다.
DB는 이 프로젝트만의 격리 fixture PostgreSQL이고 공개 포트가 없다.
기존 Supabase 테스트 배포 `compose.deploy.yml`과는 별개다.
gateway만 내부망과 별도의 ingress 네트워크에 함께 연결한다. Docker의 internal 네트워크만
사용하면 loopback 포트 publish가 활성화되지 않는 환경이 있어 이 경계를 명시했다.

이 환경은 UI와 Go API의 테스트용이다. 임시 로그인은 모든 방문자가 같은 테스트 회원을
공유하므로 실제 개인정보나 거래 정보를 입력하지 않는다. OAuth·Storage·결제는 연결하지 않는다.
이미지 업로드는 Storage 미설정 오류를 반환하며 성공으로 대체하지 않는다.

## 시작

DNS가 서버를 가리키는 전용 도메인을 준비하고 저장소 루트에서 실행한다.
아래 URL은 실제 공개 HTTPS origin으로 교체한다.

```bash
export PUBLIC_WEB_URL=https://preview.example.invalid
export GATEWAY_PORT=18080
# 아래 기본 이미지를 쓰거나, 검증한 새 웹 이미지 태그로 지정한다.
export WEB_IMAGE=summergear-web:deployment-ci
docker compose -p summergear-preview \
  -f ops/deployment/compose.ci.yml -f ops/deployment/compose.preview.yml config --quiet
docker compose -p summergear-preview \
  -f ops/deployment/compose.ci.yml -f ops/deployment/compose.preview.yml \
  up -d --wait --wait-timeout 120
```

`preview.caddy.example`의 도메인과 포트를 실제 값으로 바꾸고 Caddy의 별도 site 파일로 설치한다.
기존 site 설정은 보존하고 `caddy validate` 통과 후 reload한다. Caddy가 인증서를 발급하므로
해당 도메인의 DNS와 외부 80/443 접근이 필요하다. gateway는 loopback에만 바인딩한다.

외부 HTTPS에서 `/`, `/health/ready`, `/api/v1/auth/providers`와 브라우저 임시 로그인을 확인한다.
서비스 재시작 시 fixture 데이터는 이 프로젝트 볼륨에 유지된다. 이는 백업을 대신하지 않는다.

## 종료

같은 환경변수와 Compose 인자로 `down`을 실행하면 데이터 볼륨은 보존된다.
데이터 폐기가 필요하면 해당 프로젝트와 볼륨을 확인한 뒤 명시적으로 `down --volumes`한다.
공개 접속도 중단하려면 이번에 추가한 Caddy site 파일만 제거하고 validate 후 reload한다.
`smoke.py`는 고유 일회성 프로젝트를 사용하므로 이 preview를 종료하거나 정리하지 않는다.

## 2026-09-22 공개 기동 결과

- 주소: https://sg.jisung.lol (nhn-rocky DNS 일치 확인).
- 원격 경로: `/home/rocky/projects/summergear-verify-0cb22f9-20260922`.
- 프로젝트: `summergear-preview`. `PUBLIC_WEB_URL=https://sg.jisung.lol`, gateway 포트 18080.
- 이미지: `0cb22f9` 소스로 빌드한 4개 `:deployment-ci` 이미지.
  ID와 빌드·smoke 기록은 [Linux 검증 기록](../../docs/nhn-rocky-build-verification-20260922.md) 참조.
- Caddy site: `/etc/caddy/conf.d/summergear-preview.caddy`.
  기존 site를 보존하고 validate 성공 후 reload했다.
- CI·Supabase deploy·preview Compose의 `config --quiet` 모두 통과.
- Preview `up -d --wait --wait-timeout 120` 통과.
- 외부 TLS 검증을 끄지 않은 HTTPS 요청으로 `/` HTTP 200, `/health/ready` ready,
  `/api/v1/auth/providers` 응답을 확인했다. 검색엔진 제외 헤더도 확인했다.
- 브라우저 홈 표시, 임시 로그인 후 `/profile` 이동, `/sell` 표시 확인.
- 기존 signal-archive 컨테이너 4개의 uptime 유지와 healthy 상태 확인.
- 첫 시도의 internal-only gateway 포트 연결 실패는 ingress 네트워크 추가 후 해결했다.
- `preview-start.log`, `preview-start-public.log`는 원격 경로에 보존했다.

기존 홈·프로필에는 데모 데이터가 표시된다. `/auth/go-test`는 현재 웹에서 404이며
임시 로그인 `/auth`의 `/profile` 복귀와 구분한다. 실제 OAuth는 비활성 상태다.
전체 등록·이미지·채팅·모바일 흐름 검증이나 실제 Supabase 배포 완료를 의미하지 않는다.
애플리케이션 코드·HTTP 계약·migration 변경은 없다. 새 PUBLIC_WEB_URL 변수는 도입하지 않았고
기존 API origin 설정을 preview Compose에서 지정할 수 있도록 했다.
이번 작업은 재빌드 없이 앞서 검증한 이미지를 사용했으며 unit/DB 전체 회귀 검사를 재실행하지 않았다.

### 같은 날 임시 이미지 업데이트

웹을 `summergear-web:placeholder-20260922`로 교체했다. 이후 관리 명령에서는
`WEB_IMAGE=summergear-web:placeholder-20260922`를 사용한다. 이전 `deployment-ci` 이미지는
롤백용으로 보존했다. 새 이미지 ID는
`sha256:6434e9ad0feafe8b8efbf3307aa5d7e0161fe31f12b3ee3ac8fa18c84cfa7181`이다.

이미지가 없거나 요청에 실패한 매물 카드·홈 추천·상세 갤러리는 로컬
`/images/listing-placeholder.svg`를 표시한다. 상세 오류 안내·서명 사진 갱신은 유지한다.
API 응답·저장 데이터는 변경하지 않았다.

- `pnpm typecheck`, `pnpm --filter @icegear/web test`(17개), `pnpm --filter @icegear/web lint` 통과.
- nhn-rocky Docker Web final target의 `pnpm --filter @icegear/web build` 통과.
- preview Compose config와 웹 단독 `up -d --no-deps --wait` 통과.
- 외부 HTTPS SVG 200, API readiness 확인. 브라우저에서 Torq 추천·매물 카드의 fallback
  `naturalWidth > 0` 및 상세 임시 이미지·갱신 버튼 표시 확인.
- 원격 `placeholder-build.log` 보존. 이번 전용 Buildx 빌더와 캐시는 제거했다.
- 새 계약·migration·의존성 변경 없음. Git 커밋·push는 하지 않았다.

### 데모 이미지 조회 오류 수정

현재 웹 이미지: `summergear-web:demo-images-20260922`.
관리 명령의 `WEB_IMAGE`도 이 값으로 지정한다.
이미지 ID: `sha256:836a6230e32f11951a0a4528a0278f3920ed4110f9a211eb48ba09f94988fd86`.

매물 변환 시 Go/Supabase 출처를 보존하고 Go 매물만 Go 이미지 조회·만료 갱신을 수행한다.
데모와 로컬 매물은 기존 사진과 placeholder를 사용한다. 읽기 503은 사진 조회용 안내로
표시하며 오류 status/code는 유지한다. 재로그인 안내는 401에만 표시한다.

타입 검사·웹 테스트 18개·lint·Linux Docker production build 통과.
첫 빌드는 수정 전 타입 오류로 실패했고 수정본의 재빌드는 통과했다.
로그는 원격 `demo-images-build.log`, `demo-images-build-retry.log`에 보존했다.
웹만 교체해 healthy 및 공개 readiness를 확인했으며 Babolat 데모 상세에서 잘못된
저장 서비스 오류·갱신·재로그인 안내가 사라진 것을 브라우저로 확인했다.
실제 Storage 연결은 이번 범위가 아니며 API·DB 계약 변경이나 Git commit/push는 없다.

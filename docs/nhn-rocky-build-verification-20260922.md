# nhn-rocky Linux 빌드·기동 검증

검증일: 2026-09-22. 대상: `main`의 `0cb22f9`.
SSH 호스트 `nhn-rocky`에서 실행했고 모든 아래 명령은 종료 코드 0으로 완료했다.
외부 키가 없는 fixture 검증이며 실제 서비스 배포가 아니다.

## 환경과 소스

- Linux `5.14.0-611.13.1.el9_7.x86_64`, CPU 1개, RAM 약 2GB, swap 2GB.
- Docker 29.8.0, Compose v5.5.1, Buildx v0.37.0, Python 3.9.25.
- 기존 `/home/rocky/projects/socialapp`에는 `codex/nhn-rocky-setup` 브랜치의 미커밋 변경이 있어 보존했다.
- 로컬 `git archive HEAD`를 전송해 `/home/rocky/projects/summergear-verify-0cb22f9-20260922`에 풀었다. Git checkout이나 기존 서버 환경 파일은 변경하지 않았다.
- 전용 Buildx 빌더 `summergear-verify-0cb22f9`를 생성했다. 메모리 900MB, 메모리+swap 1600MB, CPU 0.7개로 제한하고 빌드를 순차 실행했다.

## 실행과 결과

원격 검증 폴더에서 실행했다.

```bash
docker compose -f ops/deployment/compose.ci.yml config --quiet
docker compose --env-file ops/deployment/config-check.env.example -f ops/deployment/compose.deploy.yml config --quiet
docker buildx create --name summergear-verify-0cb22f9 --driver docker-container \
  --driver-opt memory=900m --driver-opt memory-swap=1600m \
  --driver-opt cpu-period=100000 --driver-opt cpu-quota=70000
docker buildx build --builder summergear-verify-0cb22f9 --load --progress plain \
  --target web -f ops/deployment/Dockerfile.web -t summergear-web:deployment-ci .
# 이번 전용 빌더의 웹 캐시만 정리해 다음 빌드 공간 확보
docker buildx prune --builder summergear-verify-0cb22f9 --all --force
for target in api worker migration; do
  docker buildx build --builder summergear-verify-0cb22f9 --load --progress plain \
    --target "$target" -f ops/deployment/Dockerfile.go -t "summergear-$target:deployment-ci" . || exit
done
docker buildx stop summergear-verify-0cb22f9
python3 ops/deployment/smoke.py
docker buildx rm summergear-verify-0cb22f9
```

| 검증 | 결과 |
| --- | --- |
| CI·테스트 배포 Compose 설정 | 모두 통과 |
| Web final target | frozen lockfile 의존성 설치, domain build, Next production build 및 standalone 이미지 생성 통과 |
| API·worker·migration final target | Linux Go 빌드 및 역할별 이미지 생성 모두 통과 |
| 설정 가드 | 키 없는 이미지의 설정 누락·production 선택 거부 통과 |
| fixture migration·기동 | PostgreSQL 초기화, migration, API·web·gateway health 통과 |
| 동일 출처 프록시 | 첫 화면·live·ready 및 비활성 OAuth provider 응답 통과 |
| 임시 로그인·세션 | Secure/HttpOnly 쿠키, CSRF 로그아웃, 잘못된 Origin 거부 통과 |
| 장애·교체 | API 중단 시 readiness 실패, 재시작 및 API·web 재생성 후 프록시 복구 통과 |
| 실행 권한 | non-root, read-only root filesystem, 역할별 DB credential 분리 통과 |
| 정상 종료 | API·worker SIGTERM 종료 코드 0 통과 |

Smoke 최종 출력:

```text
PASS: proxy, keyless providers, temporary login/CSRF, origin rejection, readiness failure, container replacement, non-root/role isolation, SIGTERM
```

## 이미지와 로그

이미지는 원격 Docker에 보존했다. 레지스트리 push는 수행하지 않았다.
아래 값은 `docker image inspect`의 로컬 이미지 ID다.

| 이미지 (`:deployment-ci`) | 이미지 ID |
| --- | --- |
| summergear-web | `sha256:36141582229c22108813d9580663fcbbc3d90db7ef0a88b6985690c4db084b86` |
| summergear-api | `sha256:b91bf0896cfa9e15e70ff274536a668daa3bc53927194eff876ed0381e33ea41` |
| summergear-worker | `sha256:46883c42c1d1320869bf50bf0d593beb79a68622cfbf022db832c670491a8590` |
| summergear-migration | `sha256:b79f724440346348d8feef1bfd2b37cdf99d6ae2869b5334a29b90df72bd889b` |

원격 검증 폴더에 `web-build.log`, `api-build.log`, `worker-build.log`,
`migration-build.log`, `smoke.log`, `web-cache-cleanup.log`와 소스 snapshot을 보존했다.
Smoke 프로젝트 `summergear-smoke-f55b35c9d28a`의 컨테이너·볼륨·네트워크는 제거됐고
해당 network/volume 조회가 빈 결과임을 확인했다. 전용 빌더와 캐시도 제거했다.
기존 signal-archive 서비스 4개의 uptime은 유지됐고 모두 healthy였다.
종료 시 루트 디스크 여유 공간은 약 6GB였다.

## 범위와 남은 검증

이번 실행은 병합 후 final 이미지 빌드와 runtime smoke의 미검증 범위를 해소한다.
`verification` target의 별도 web typecheck/test/lint 전체 검사,
Go vet/race/unit/integration compile, `database.py`의 전체 DB/RLS 테스트는 재실행하지 않았다.
Next build 중 TypeScript 검사는 전체 workspace typecheck를 대신하지 않는다.
실제 Supabase·Storage/CORS·OAuth·TLS·모바일 실기기·백업 복원은 별도 검증이 필요하다.
Worker 프로세스 기동·정상 종료 검사는 실제 River 업무 처리 검증을 대신하지 않는다.

애플리케이션 코드·계약·migration·환경변수 변경은 없다. 새 브랜치·커밋·원격 push는 생성하지 않았다.

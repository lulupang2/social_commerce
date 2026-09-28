# nhn-rocky 작업 환경

기존 Next.js·Expo·Supabase 앱에 별도 Go API·River 기반, 서비스 세션/테스트 임시 로그인과 첫 Go 소유 매물 API를 추가했습니다. [기반 실행 안내](FOUNDATION.md)와 [검증 결과](../../docs/foundation-verification.md)를 확인합니다. 실제 네이버·카카오 연결, 이미지 전환, 토스페이먼츠·운영 배포는 아직 후속입니다.

## 위치

- 저장소: `/home/rocky/projects/socialapp`
- 준비 브랜치: `codex/nhn-rocky-setup`
- Go·River 서버 비밀 설정: `/home/rocky/.config/summergear/test.env`
- 현재 웹 공개 설정: `/home/rocky/projects/socialapp/apps/web/.env.local`
- 선택적 Expo 설정: `/home/rocky/projects/socialapp/apps/mobile/.env`

`bash ops/nhn-rocky/prepare-env.sh`는 값이 비어 있는 파일만 생성하고 기존 내용을 덮어쓰지 않습니다. 비밀 설정 디렉터리는 700, 파일은 600 권한을 사용합니다. 서비스 실행·DB 연결·migration은 수행하지 않습니다.

DB·PG·소셜 비밀키는 `test.env`에만 입력합니다. Go 명령은 `--env-file`로 이 파일을 읽으며 기존 Next.js·Expo 앱은 자동으로 읽지 않습니다. 현재 Go 기반은 `APP_ENV=test`와 테스트 전용 DB 대상을 요구하고, live 결제 설정을 거부합니다. 현재 Next.js에는 테스트 프로젝트의 URL·공개 publishable key만 설정하고 secret/service-role 키를 넣지 않습니다.

## 개발 도구

Node.js는 루트 `engines` 조건을 충족해야 하며 pnpm은 `packageManager`의 10.34.5를 사용합니다. 호스트의 다른 프로젝트용 pnpm 전역 버전은 변경하지 않습니다.

저장소 루트에서 `npx --yes pnpm@10.34.5 install --frozen-lockfile`로 준비하고 같은 pnpm 버전으로 테스트합니다. 서버 자원을 고려해 설치·검사를 순차 실행합니다. Go는 `apps/api/go.mod`와 프로젝트 전용 Docker 도구 이미지로 고정합니다. 호스트에 전역 설치하지 않으며 실행 방법은 [기반 안내](FOUNDATION.md)를 따릅니다.

아래 과거 준비 기록에서는 웹·API·worker를 실행하거나 운영 DB를 변경하지 않았습니다. 이후 배포는 [배포 설계](../../docs/deployment.md)와 [테스트 결제 준비](../../docs/payment-test-setup.md)를 따릅니다.

## 준비 검증 기록 · 2026-09-18

`nhn-rocky`, Node.js 24.20.0, pnpm 10.34.5에서 기존 앱 기준으로 확인했습니다. Node는 프로젝트의 최소 요구사항을 충족하며 호스트 전역 버전을 변경하지 않았습니다. 초기 코드 기준 커밋은 `f98d56d`이고 이후 변경은 준비 기록·문서 정리입니다.

- 고정 lockfile 의존성 설치 완료
- `--filter @icegear/domain build`: 통과
- `--workspace-concurrency=1 -r --if-present test`: 24개 통과 (domain 13, mobile 7, web 4)
- `--filter @icegear/web exec next typegen`: 통과
- `--workspace-concurrency=1 -r --if-present typecheck`: 통과
- `--workspace-concurrency=1 -r --if-present lint`: 통과
- 설정 준비 스크립트 문법·반복 실행·기존 내용 보존, 파일 권한과 Git 제외 확인

위 옵션은 모두 `npm exec --yes --package=pnpm@10.34.5 -- pnpm` 뒤에 전달했습니다. pnpm 설치 시 의존 패키지 일부의 build script는 기본 차단 상태였으며 위 검사는 통과했습니다. 전체 Next.js 운영 빌드·Expo export·DB/PG 통합·실기기 테스트는 이번 준비 범위에서 수행하지 않았습니다.

Git은 공개 저장소 HTTPS로 연결합니다. 비공개 상태에서 잠시 생성했던 저장소 전용 배포 키는 공개 전환 후 GitHub와 서버 양쪽에서 제거했습니다. 서버에 GitHub 개인 토큰을 저장하지 않았습니다.

위 준비 기록 당시에는 Go 소스·River 구현이 없었습니다. 이후 추가한 기반·인증 세션·`0009_go_listings.sql`과 격리 테스트는 [별도 검증 기록](../../docs/foundation-verification.md)을 따릅니다. `bash ops/nhn-rocky/test-listings-database.sh`로 매물 소유권/RLS 회귀를 별도로 확인할 수 있습니다. 토스페이먼츠와 운영 DB migration·서비스 배포는 수행하지 않았습니다.

## 격리 거래 브라우저 E2E

저장소 루트에서 `pnpm install --frozen-lockfile`로 의존성을 준비하고 Docker 데몬과 로컬 Chrome을 실행할 수 있는 환경에서 다음을 실행합니다. Windows에서는 Git Bash(`C:/Program Files/Git/bin/bash.exe`)로 같은 스크립트를 호출합니다.

```sh
bash ops/nhn-rocky/run-commerce-e2e.sh
```

스크립트는 Go API와 migration 바이너리를 고정된 Linux 이미지에서 빌드하고, 실행마다 고유한 Compose 프로젝트·PostgreSQL 볼륨을 만들고 migration을 적용합니다. fixture 운영자와 사전 승인된 다른 판매자만 준비하며 나머지 판매자 신청·매물·재고·주문은 분리된 실제 브라우저 세션이 만듭니다. Next.js는 loopback에서 실제 Go API로 프록시하고, 로그인은 `APP_ENV=test`와 `AUTH_DEV_LOGIN_ENABLED=true` 및 fixture 전용 계정만 사용합니다. 결제/취소는 테스트 PG만 호출하며 실제 OAuth·PG 키나 운영 DB에 접근하지 않습니다.

테스트는 `apps/web/e2e/commerce.spec.ts`에 있습니다. 선택적 Playwright 인수는 스크립트 뒤에 그대로 전달할 수 있습니다(예: `--grep "real isolated buyer/seller/operator"`). 실패 시 로그는 `.foundation-cache/results/<project>.*.log`, 스크린샷은 `.foundation-cache/playwright-results/`에 남습니다. 성공·실패 모두 이 실행에서 만든 웹 프로세스·Compose 프로젝트·DB 볼륨·일시 바이너리만 정리하며 기존 Docker 프로젝트나 작업 트리는 건드리지 않습니다. 최신 실행 결과와 미검증 범위는 [격리 거래 E2E 검증 기록](../../docs/commerce-e2e-verification-20260928.md)을 참조합니다.

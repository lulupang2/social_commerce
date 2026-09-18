# nhn-rocky 작업 환경

현재 앱은 Next.js·Expo·Supabase 구현입니다. Go·River·토스페이먼츠는 설계 단계이며 이 디렉터리는 환경 설정 템플릿만 제공합니다.

## 위치

- 저장소: `/home/rocky/projects/socialapp`
- 준비 브랜치: `codex/nhn-rocky-setup`
- Go·River·PG 예정 비밀 설정: `/home/rocky/.config/summergear/test.env`
- 현재 웹 공개 설정: `/home/rocky/projects/socialapp/apps/web/.env.local`
- 선택적 Expo 설정: `/home/rocky/projects/socialapp/apps/mobile/.env`

`bash ops/nhn-rocky/prepare-env.sh`는 값이 비어 있는 파일만 생성하고 기존 내용을 덮어쓰지 않습니다. 비밀 설정 디렉터리는 700, 파일은 600 권한을 사용합니다. 서비스 실행·DB 연결·migration은 수행하지 않습니다.

DB·PG·소셜 비밀키는 `test.env`에만 입력합니다. 이 파일은 Go 구현 시 사용할 예정이며 현재 앱에서 자동으로 읽지 않습니다. `PAYMENT_MODE=test`도 구현 전에는 실행 차단 장치가 아닙니다. 현재 Next.js에는 테스트 프로젝트의 URL·공개 publishable key만 설정하고 secret/service-role 키를 넣지 않습니다.

## 개발 도구

Node.js는 루트 `engines` 조건을 충족해야 하며 pnpm은 `packageManager`의 10.34.5를 사용합니다. 호스트의 다른 프로젝트용 pnpm 전역 버전은 변경하지 않습니다.

저장소 루트에서 `npx --yes pnpm@10.34.5 install --frozen-lockfile`로 준비하고 같은 pnpm 버전으로 테스트합니다. 서버 자원을 고려해 설치·검사를 순차 실행합니다. Go는 아직 `go.mod`가 없으므로 구현 단계에서 버전을 고정한 뒤 설치합니다. 서버 준비 완료와 Go 서비스 실행 가능 상태를 구분합니다.

이번 준비에서는 웹·API·worker를 실행하거나 운영 DB를 변경하지 않습니다. 이후 배포는 [배포 설계](../../docs/deployment.md)와 [테스트 결제 준비](../../docs/payment-test-setup.md)를 따릅니다.

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

현재 Go 소스·`go.mod`·River·토스페이먼츠 구현과 배포 구성은 없습니다. Go 도구 설치·버전 고정은 API 구현 단계에서 진행합니다. 운영 DB migration, 컨테이너 기동·재시작, 서비스 배포는 수행하지 않았습니다.

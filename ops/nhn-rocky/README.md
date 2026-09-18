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

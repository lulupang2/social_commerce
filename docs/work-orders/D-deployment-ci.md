# D: 배포 설정과 키 없는 CI 준비

시작점: A 통합 커밋. 브랜치 예: `codex/deployment-ci`.
B/C와 동시에 진행한다. 현재 요청은 구성·검증 준비이며 실제 배포/실제 키 등록은 후속이다.

## 수정 범위

- `.github/workflows/**`, Dockerfile/dockerignore, 배포 전용 `ops/**`.
- 환경변수 예시, `docs/deployment.md`, CI/기동/복구 문서.
- 공통 package.json/lockfile 변경이 필요하면 A/C에 먼저 변경 범위를 공유한다.
- API/웹 업무 코드와 DB migration은 수정하지 않는다.

## 작업과 완료 조건

1. Linux CI에서 Go 테스트/vet, integration 태그 컴파일, 격리 DB/RLS 검증을 실행한다.
   이미지 패키지가 DB 테스트에서 누락되지 않게 한다. Windows 0600 문제를 테스트 삭제로 우회하지 않는다.
2. pnpm 고정 버전, 타입/웹 테스트/lint/build를 실제 서비스 키 없이 실행한다.
3. API·worker·migration·웹의 이미지와 테스트/배포 Compose를 분리한다.
   기존 fixture Compose는 운영 구성이 아니다.
4. 동일 출처 /api/v1 프록시, 헬스/준비 상태, 기동 순서, 종료, 로그, 최소 권한을 확인한다.
5. 서버 전용 키와 NEXT_PUBLIC/EXPO_PUBLIC 값을 구분한다. CI에 실제 키를 요구하지 않는다.
6. migration 실행 주체, 백업/복구·이전 이미지로 롤백·설정 누락 시 동작을 문서화한다.
   현재 APP_ENV/DB_TARGET에서 운영 환경을 거부하는 가드를 임의 해제하지 않는다.

## 검증 명령과 보고

`docker compose -f <작성한 구성> config --quiet`, 각 이미지의 `docker build`,
키 없는 smoke test와 CI 동일 명령을 실행한다. 정확한 경로/명령을 완료 보고에 적는다.
이미지 빌드·통합 테스트는 자원을 고려해 순차 실행한다.
실제 도메인/TLS·Supabase 역할/pooler·OAuth 리다이렉트·Storage CORS·운영 복구 연습은 후속 체크리스트로 남긴다.

완료 보고: 커밋, CI 실행 결과, 빌드/기동 검증, 필요한 실제 환경변수 이름(값 제외), 미검증 배포 단계.

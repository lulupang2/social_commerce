# A 병합 복구 검증

날짜: 2026-09-21. 시작 커밋: `0ce9390`, 브랜치: `main`.
이 기록은 A 계약 정렬·연결 복구 검증이며 B/C/D의 전체 완료나 실서비스 배포를 의미하지 않는다.

## 확인한 원인과 수정

- 매물 핸들러의 nil 이미지 의존성을 등록된 `listingimages.Service`로 교체.
- 매물 HTTP 응답·웹 strict Zod·OpenAPI의 필수 images 배열을 일치시키고 웹 회귀 테스트 추가.
- 구형 TTL/Storage 인터페이스가 남은 integration 태그 코드를 수정.
- 삭제된 HTTP·복구·이미지 서명 테스트를 현행 슬롯 계약에 맞게 복원.
- 서명 URL은 해당 Storage 출처/객체 경로/token만 허용. public·타 출처·서명 없는 URL 거부.
- 기존 signed-upload migration을 유지하고 문서의 구형 multipart/확장자 경로 설명을 정정.
- 이미지 DB 테스트 패키지를 Linux 실행 스크립트에 포함.

## 실제 실행 결과

| 검증 | 환경 | 결과 |
| --- | --- | --- |
| 플랫폼 설정 테스트 | Linux ELF 테스트 바이너리, Rocky10 WSL | 통과 |
| `go test -p=1 ./...` | Go 1.27.1 Linux Docker | 통과 |
| `go vet ./...` | Go 1.27.1 Linux Docker | 통과 |
| `go test -p=1 -tags=integration ./... -run '^$'` | Go 1.27.1 Linux Docker | 전체 integration 태그 컴파일 통과; 테스트 실행과 구분 |
| `go test -p=1 -tags=integration -count=1 -timeout=180s -v ./internal/listings ./internal/listingimages` | 전용 PostgreSQL Docker, fixture 역할 3개 | 통과 |
| `pnpm --filter @icegear/web test` | Windows | 5/5 통과 |
| `pnpm typecheck` | Windows | domain/web/mobile 통과 |
| `pnpm --filter @icegear/web lint` | Windows | 통과 |
| `pnpm --filter @icegear/web build` | Windows | 프로덕션 빌드 통과 |

격리 DB는 새 Compose 프로젝트 `summergear-a-integration`으로 생성했다.
기존 동명 컨테이너/볼륨/네트워크가 없음을 확인한 뒤
`docker compose --project-name summergear-a-integration -f ops/nhn-rocky/compose.foundation-test.yml up -d --wait postgres`를 실행했다.
Go 테스트 컨테이너는 이 네트워크만 사용하고 저장소를 `/workspace`에 마운트했다.
접속 값은 기존 스크립트의 공개 fixture 계정이며 실제 서비스 키나 프로젝트 DB를 사용하지 않았다.
재현은 `bash ops/nhn-rocky/test-listings-database.sh`를 사용한다.
검증 후 이번에 만든 전용 컨테이너·볼륨·네트워크만 Compose down --volumes로 정리했다.
임시 fixture 데이터는 폐기했으며 스크립트로 재생성할 수 있다.

플랫폼 테스트의 Windows 실패는 env 파일 권한 검사의 `Mode().Perm() & 0077` 조건 때문이다.
테스트 자체가 임시 설정과 fixture DSN을 만들기 때문에 실제 키 부족과 무관하다.
같은 소스로 만든 Linux 테스트 바이너리는 WSL의 Linux 임시 디렉터리에서 두 테스트를 포함해 통과했다.
권한 검사를 약화하거나 테스트를 skip하지 않았다. Windows 실패 메시지에는 실제 오류를 표시하도록 개선했다.

## 미완료 범위

전체 파일 디코딩·4096px 제한, 취소/만료 정리, 교체 경쟁, 전체 실제 세션 HTTP 회귀는 B의 완료 조건이다.
브라우저 전체 등록/수정/실패 재시도 흐름은 C, CI·배포 구성은 D가 담당한다.
실제 Storage·OAuth·CORS·모바일 실기기·운영 배포는 실제 키 등록 후 별도 검증한다.
각 담당의 구체적인 인수 조건은 [작업 지시서](work-orders/README.md)를 따른다.

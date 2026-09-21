# B: Go 이미지 API 완성

시작점: A 통합 커밋. 브랜치 예: `codex/image-api-completion`.
[공통 계약](../listing-images.md)을 먼저 읽고 현재 서명 업로드 흐름을 유지한다.
실제 키는 사용하지 않는다. Go httptest Storage와 격리 PostgreSQL을 사용한다.

## 수정 범위

- `apps/api/internal/listingimages/**` 및 필요한 후속 DB migration/test.
- `apps/api/internal/listings/*_test.go`의 이미지 통합 시나리오.
- OpenAPI 변경이 꼭 필요하면 변경 제안을 A에 보고하고 C와 계약을 맞춘다.
- 웹 UI, 배포 파일, 기존 적용 migration은 수정하지 않는다.

## 작업과 완료 조건

1. 전체 이미지 검사/4096px 제한을 복원한다. 현재 ReadPrefix(32바이트)는 충분하지 않다.
   10 MiB 제한 안에서 읽고 JPEG/PNG/WebP 구조·차원을 검증한다. 잘린 이미지·위장 MIME·과대 이미지 테스트 포함.
2. HTTP에서 실제 auth의 세션·Origin·CSRF 차단과 비소유자 조회/변경 차단을 검증한다.
3. 업로드·complete·교체·삭제의 정상/실패/재시도 계약을 검증한다.
   교체 실패 시 이전 이미지를 유지하고 12장 상태의 교체도 가능해야 한다.
4. 동시 슬롯·같은 위치 경쟁·같은 이미지 교체 경쟁을 실제 DB로 검증한다.
5. 요청 취소, 객체 삭제 성공 후 DB 실패, 교체 후 이전 객체 삭제 실패, 슬롯 만료 후 객체 유출을 복구한다.
   정리 주체·실행 명령·멱등성·관찰 방법을 문서화한다. 오래된 실패 행이 무한히 누적되지 않아야 한다.
6. 이미지가 있는 목록/상세의 회원별 조회와 동일한 signed 응답을 검증한다.

## 검증 명령

Linux, `apps/api`에서 `go test ./...`, `go vet ./...`,
`go test -tags=integration ./... -run '^$'`(컴파일만; DB 검증 아님).
저장소 루트에서 `bash ops/nhn-rocky/test-listings-database.sh`로 격리 DB 테스트.
스크립트는 새 전용 Compose만 만들며 기존 리소스가 있으면 중단한다.
Docker가 없으면 DB 검증 미실행으로 보고한다. 단위 테스트 통과로 대체하지 않는다.

완료 보고: 커밋, 계약 변경 여부, 정상/실패/경쟁·RLS 테스트 결과, 실제 Storage에서 추후 확인할 사항.

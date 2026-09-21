# A 통합 기준과 병렬 작업 지시

2026-09-21. B/C/D는 이번 A 커밋을 공통 시작점으로 삼는다.
실제 키는 나중에 등록한다. 각 담당은 별도 브랜치·워크트리에서 구현·검증·커밋하고 A가 통합한다.
이 문서 작성은 B/C/D 작업 실행이나 완료를 의미하지 않는다.

공통 계약: [listing-images.md](../listing-images.md), `apps/api/openapi.yaml`.

| 담당 | 지시서 | 시작 조건 |
| --- | --- | --- |
| B | [이미지 API](B-image-api.md) | A 커밋과 계약 확인 |
| C | [이미지 UI](C-image-ui.md) | A 커밋, 가짜 API로 B와 동시에 |
| D | [배포·CI](D-deployment-ci.md) | A 커밋, B/C와 동시에 |

## 병합 감사

비교 대상: `4488d58`(multipart API), `476fb53`(서명 슬롯 API), `47f27fe`(웹),
`a56fab5`(충돌 파일 일괄 선택), `4939f54`/`d6cb7f1`/`e6391db`(테스트·검사 삭제), `0ce9390`(nil 연결).

| 손실·불일치 | A 조치 또는 후속 담당 |
| --- | --- |
| nil ImageReader로 매물 응답 패닉 가능 | A: 등록한 이미지 Service를 매물 핸들러에 실제 연결 |
| 웹 strict schema/OpenAPI에 images 누락 | A: 필수 images 배열 정렬·실제 응답 회귀 테스트 |
| integration 태그에서 TTL/Storage 인터페이스 컴파일 실패 | A: 현행 인터페이스로 수정 |
| HTTP 이미지 테스트 삭제 | A: 슬롯 발급·읽기·미허용 필드·회원 전달 테스트 복원. B: 실제 세션/CSRF/비소유자 전체 HTTP 행렬 |
| 복구 테스트 삭제 | A: 서명 URL 경계·삭제 DB 실패 재시도·슬롯 실패 상태 복원. B: 취소·교체·만료 전체 복구 |
| 이미지 크기/차원 검사 삭제 | A: 서명 감지 테스트 복원. B: 실제 파일 검증과 4096px 제한 복원 필수 |
| 다른 출처/public/unsigned Storage URL 허용 | A: 정확한 출처·객체 경로·token 검사 복원 |
| 문서는 multipart, B/C는 서명 슬롯 | A: 서명 슬롯으로 문서 통일; 메타데이터 PATCH/정렬은 현재 범위 제외 |
| 키 없는 Go 테스트 실패 | POSIX 0600 검사와 Windows 권한 모델 차이. Linux에서 동일 플랫폼 테스트 통과 확인 |
| 이미지 DB 테스트가 실행 스크립트에서 빠짐 | A: listings-integration에 listingimages 패키지 추가 |

Windows에서 보안 파일 권한 검사를 우회하거나 실패 테스트를 삭제하지 않는다.
서버·CI 검증은 Linux로 수행한다. Windows는 웹 개발과 Go 빌드에 사용할 수 있다.

## 최종 통합 절차와 완료 조건

1. B/C/D는 변경 파일·커밋·실행 명령·결과·남은 실제 연동 검증을 보고한다.
2. A는 B의 API/DB와 C의 응답 검증·업로드 요청을 비교한 후 순차 병합한다.
3. 테스트를 삭제하거나 nil 의존성으로 바꾸어 컴파일만 통과시키지 않는다.
4. Linux `go test ./...`, `go vet ./...`, integration 태그 컴파일 및 격리 DB/RLS 테스트를 통과한다.
5. `pnpm typecheck`, 웹 테스트·lint·build 및 가짜 외부 서비스로 등록→이미지 저장→수정→재조회 흐름을 검증한다.
6. D의 CI가 키 없이 실행되며 실제 키/배포는 별도 단계로 남긴다.

현재 A 검증 결과는 [통합 검증 기록](../integration-a-verification.md)에 기록한다.

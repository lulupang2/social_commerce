# C: 매물 등록·수정 이미지 UI 완성

시작점: A 통합 커밋. 브랜치 예: `codex/image-ui-completion`.
[공통 계약](../listing-images.md)에 맞춘 가짜 API로 B와 동시에 진행한다.

## 수정 범위

- `apps/web/app/sell/**`, `apps/web/app/market/**`, 관련 홈 이미지 표시.
- `apps/web/components/media/**`, `apps/web/components/listings/**`.
- `apps/web/lib/go-listings/**`, `apps/web/lib/listings/use-listings.ts`, 관련 UI 테스트/CSS.
- Go/SQL/OpenAPI/배포 파일 변경은 A/B/D에 제안한다.

## 작업과 완료 조건

1. 등록→슬롯 발급→PUT→complete→재조회 성공을 검증한다. 부분 실패를 전체 성공으로 표시하지 않는다.
2. 수정 진입 시 저장된 사진을 복원하고 추가·교체·삭제가 새로고침 후에도 유지되도록 한다.
   업로드 실패에도 입력값과 기존 이미지를 보존하고 실패 사진만 재시도한다.
3. sortOrder는 0..11 중 빈 자리를 선택한다. 임의 재정렬 PATCH를 만들지 않는다.
   대표 사진은 가장 작은 sortOrder다. 12장 제한과 교체 예외를 처리한다.
4. 서명 URL 만료·503·401·404·409·410을 구분하고 갱신/재로그인/재시도 UI를 검증한다.
5. 비소유자·active 매물의 이미지 변경 UI를 계약에 맞게 제한한다.
6. 업로드 성공 응답 유실 시 GET /images로 완료 여부를 확인한다.
   자동 삭제가 이미 완료된 정상 이미지를 제거하지 않도록 한다.
7. 키 없는 환경에서 성공을 가장하지 않는다. 가짜 서버는 테스트에만 사용한다.

## 검증 명령

루트에서 `pnpm --filter @icegear/web test`, `pnpm typecheck`,
`pnpm --filter @icegear/web lint`, `pnpm --filter @icegear/web build`.
브라우저 테스트로 등록/교체/삭제/실패 재시도/새로고침/서명 만료를 가짜 API에서 검증한다.
실제 Storage 업로드·모바일 카메라/앨범 실기기 확인은 별도 미검증으로 보고한다.

완료 보고: 커밋, 화면별 결과, 브라우저 검증 증거, B와 연결할 때의 주의점.

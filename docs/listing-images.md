# Go 매물 이미지 공통 계약

기준일: 2026-09-21 · A가 병합 후 확정한 B/C/D 구현 기준.
HTTP 기계 계약은 `apps/api/openapi.yaml`, 구현 인수 조건은 이 문서를 따른다.
아직 충족하지 못한 조건은 [작업 지시서](work-orders/README.md)에 명시한다.

## 결정과 범위

현재 B/C 구현에 공통으로 존재하는 **서명 URL 직접 업로드 + 완료 확인**을 채택한다.
이전 multipart 업로드·이미지 PATCH 계약은 폐기한다. 그 구현에서 제공하던 픽셀 크기 검사,
서명 URL 검증, 삭제 복구, 요청 취소 시 정리 보장은 삭제하지 않고 새 방식의 인수 조건으로 옮긴다.
실제 OAuth·Storage 키는 후속 등록한다. 테스트는 가짜 Storage/OAuth와 격리 PostgreSQL만 사용한다.

## HTTP 계약

모든 경로는 `/api/v1/listings/{id}` 기준이다.

| 메서드·경로 | 요청 | 성공 응답 |
| --- | --- | --- |
| GET /images | 쿠키 선택; 공개 active 또는 소유 매물만 | 200 {listingId, images} |
| POST /images/uploads | JSON {mimeType,fileSizeBytes,sortOrder?,altText?,replaceImageId?} | 201 {imageId,uploadUrl,expiresAt} |
| POST /images/{imageId}/complete | 빈 본문 | 200 {imageId,state:"ready"} |
| DELETE /images/{imageId} | 빈 본문 | 204 |

변경 요청은 서비스 세션, 동일 출처·CSRF 검사를 통과해야 한다.
memberId/sellerId/storagePath를 받지 않는다. 소유권은 세션과 DB에서 결정한다.
이미지 변경 가능 상태는 현재 매물 수정 규칙과 동일한 draft/pending_review/rejected다.
active 매물의 이미지 수정은 이번 계약에 포함하지 않는다.

새 업로드는 sortOrder(0..11)가 필수다.
교체는 replaceImageId가 필수이며 같은 매물·소유자의 ready 이미지만 참조한다.
교체 시 sortOrder를 생략하거나 기존 값과 같게 보낸다. 완료 전까지 기존 이미지를 보존한다.
빈 대체 텍스트는 null 또는 생략으로 보낸다. 지정 시 공백 제거 후 1..160자다.
별도 정렬·메타데이터 PATCH는 없다. C는 구현되지 않은 경로를 호출하지 않는다.

클라이언트는 uploadUrl로 파일 바이트를 PUT한 뒤 complete를 호출한다.
실패 시 성공 UI를 표시하지 않는다. 발급된 슬롯은 DELETE로 정리하고 정리 실패는 재시도 대상으로 남긴다.
슬롯 유효 기간은 2시간, 읽기 URL은 최대 600초다.

## 응답과 오류

매물 목록·상세·등록·수정 응답 모두 images 배열을 반드시 포함한다. 없으면 []이며 null이 아니다.
별도 GET /images와 같은 signed 이미지 형식을 사용한다.

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "state": "signed",
  "url": "https://storage.example.invalid/storage/v1/object/sign/listing-images/member/listing/image?token=opaque",
  "expiresAt": "2026-09-21T00:10:00Z",
  "altText": null,
  "sortOrder": 0
}
```

altText는 null 또는 생략 가능. images는 sortOrder 오름차순이며 최대 12개다.
원시 storagePath, service-role 키, 미완료 슬롯은 공개 응답에 넣지 않는다.
Storage 서명 실패는 503 IMAGE_STORAGE_UNAVAILABLE로 반환한다.
임의 public URL이나 빈 성공 결과로 대체하지 않는다. C는 기존 입력과 재시도 수단을 유지한다.

오류 응답: {code,message,requestId}.
400 IMAGE_INVALID, 404 IMAGE_NOT_FOUND, 409 IMAGE_LIMIT_EXCEEDED/IMAGE_CONFLICT/IMAGE_UPLOAD_INCOMPLETE,
410 IMAGE_UPLOAD_EXPIRED, 503 IMAGE_STORAGE_UNAVAILABLE/IMAGE_DATABASE_UNAVAILABLE.
인증·CSRF 오류는 기존 auth 계약을 따른다.
complete 재호출의 현재 동작은 pending 슬롯만 허용하는 것이다.
응답 유실 시 먼저 GET /images로 완료 여부를 확인한다. 멱등 성공으로 변경하려면 A 승인 계약 변경이 필요하다.

## DB와 Storage

기준 migration은 0010_go_listing_images.sql이다. 적용 이력이 있는 SQL을 다시 쓰지 않는다.
추가 제약·인덱스·정리 작업이 필요하면 후속 migration을 만든다.

- 테이블: summergear_app.listing_images.
- ID/매물/소유자: id, listing_id, member_id. 매물+소유자 복합 FK.
- 객체 경로: 정확히 <member_uuid>/<listing_uuid>/<image_uuid> (확장자 없음).
- 메타데이터: mime_type, file_size_bytes, alt_text, sort_order.
- 상태: pending_upload → ready 또는 upload_failed; 삭제·교체 대상은 deleting.
- 수명: upload_expires_at, completed_at, created_at, updated_at.
- 교체 연결: replaces_image_id.
- ready 위치는 매물 내 unique. pending 교체는 이전 이미지당 하나.
- API 역할의 회원 컨텍스트는 트랜잭션 로컬이며 다른 요청에 누출되면 안 된다.
- 외부 클라이언트와 worker는 직접 수정 권한이 없다.

private listing-images 버킷을 사용한다. service-role 자격 증명은 Go에만 둔다.
서명 응답은 설정된 Storage 출처·해당 객체 경로·token이 일치해야 한다.
활성 이미지/슬롯 제한과 병렬 요청은 매물 잠금 및 DB 제약으로 보장한다.
교체 중 이전 ready+새 pending이 공존할 수 있으므로 '메타데이터 전체가 최대 12행'은 아니다.
노출 ready 이미지는 최대 12개이고 새 업로드의 활성 슬롯 계산도 최대 12를 지킨다.

## B/C 완료 시 반드시 충족할 품질 조건

- JPEG/PNG/WebP, 파일 최대 10 MiB, 가로·세로 각각 최대 4096px.
- MIME 문자열이나 짧은 magic bytes만으로 완료 처리하지 않고 실제 파일 구조·크기를 검증한다.
- 교체 실패 시 기존 사진 유지, 삭제 중 객체 404는 정리 재시도 성공으로 취급.
- DB 실패·요청 취소·슬롯 만료 후 남은 객체와 deleting/failed 행의 복구 경로와 테스트.
- 다른 회원의 업로드/조회/삭제/교체와 공개되지 않은 매물 조회 차단.
- C는 만료된 읽기 URL 갱신, 업로드 실패 재시도, 저장 후 재조회, 새로고침 복구를 검증.

A 단계에서 경로·응답·DB 계약은 정렬했지만, 위 품질 조건의 전체 구현 완료를 의미하지 않는다.
실제 Supabase 응답 형식·CORS·역할·버킷 정책 및 모바일 실기기 검증은 키 등록 후 별도 수행한다.

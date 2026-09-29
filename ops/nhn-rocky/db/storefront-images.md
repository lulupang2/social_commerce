# 테스트 카탈로그 예시 사진

`storefront-fixture.sql`의 상품 16개에 대응하는 생성 이미지다. 실물 판매 사진이나
Storage 업로드 결과가 아니다. 웹은 정확한 Go 상품 ID와 소유자 조합에만 적용하며,
서버가 실제 사진을 반환하면 그 사진을 우선한다. 이미지 조회 실패는 기존 오류와
재시도 UI를 유지한다.

- 파일: `apps/web/public/images/storefront/catalog-01.webp`부터 `catalog-16.webp`
- 생성: 내장 ImageGen, 2026-09-30. 외부 쇼핑몰 사진이나 브랜드 로고를 사용하지 않았다.
- 배포 파일: 너비 800px WebP, quality 82. 원본은 생성 이미지 보관소에 보존한다.
- 상품 정보 갱신: 격리 fixture에서 `psql --no-psqlrc -v ON_ERROR_STOP=1
-v refresh_copy=true -f storefront-fixture.sql`. 재고·가격·판매 상태는 갱신하지 않는다.
- API 이미지 계약, private Storage와 서명 URL 발급에는 변경이 없다.

## 프롬프트 세트

공통 지시: “Create one photorealistic secondhand marketplace product photograph in
vertical 4:5 framing. Entire product visible, ample margin for mobile card crop,
natural indirect daylight, honest carefully composed smartphone product photo,
realistic material texture and proportions, no branding, no logos, no text,
no people, no collage. Illustrative photo for a fictional sports equipment test listing.”

| 파일 번호 | 상품별 장면 지시                                                          |
| --------- | ------------------------------------------------------------------------- |
| 01        | 8ft 민트 소프트보드, 네이비 레일, 검정 리시, 밝은 차고 벽과 콘크리트 바닥 |
| 02        | 검정 98 헤드 테니스 라켓, 흰 그립, 검정 커버, 파란 코트 바닥              |
| 03        | 흰색 7ft 미드렝스 보드, 가는 블루 스트라이프, 밝은 벽                     |
| 04        | 민트색 입문 라켓, 검정 그립, 연회색 바닥                                  |
| 05        | 검정 체스트집 3/2mm M 웻슈트, 나무 옷걸이, 밝은 벽                        |
| 06        | 흰색·네이비 올코트 테니스화 한 쌍, 코트 옆 벤치                           |
| 07        | 미디엄 서핑 트라이핀 세 개와 검정 파우치, 밝은 콘크리트                   |
| 08        | 네이비·세이지 6라켓 가방, 어깨끈과 지퍼 수납부, 코트 벤치                 |
| 09        | 검정 6ft 리시, 발목 커프와 스위블·레일세이버, 밝은 바닥                   |
| 10        | 세이지색 기능성 반팔 L, 흰 천 위에 펼친 모습                              |
| 11        | 실버 7ft 패딩 보드백, 검정 노즈·테일과 어깨끈, 차고 벽                    |
| 12        | 흰 오버그립 6개·검정 6개, 3열 4행 배열, 밝은 나무 테이블                  |
| 13        | 옅은 옐로 5ft 8in 피쉬보드, 스왈로 테일, 우드 스트링거, 해변 주택 벽      |
| 14        | 사용감 있는 테니스공 약 24개와 검정 철제 바구니, 녹색 코트                |
| 15        | 검정 3mm 서핑 부츠 한 쌍, 고무 밑창과 보강 토, 콘크리트 바닥              |
| 16        | 코럴·네이비 26인치 주니어 라켓, 흰 그립과 네이비 커버, 밝은 바닥          |

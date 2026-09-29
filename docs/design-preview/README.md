# SummerGear portfolio design preview

취업용 포트폴리오에서 SummerGear의 첫 인상과 커머스 완성도를 비교하기 위한 디자인 시안이다.
기존 홈, 마켓, 상품 상세는 변경하지 않고 별도 로컬 경로에 A/B안을 구현했다.

## 로컬 미리보기

개발 서버 실행:

```sh
pnpm --filter @icegear/web dev --hostname 127.0.0.1 --port 3000
```

- A안 홈: http://127.0.0.1:3000/preview/a
- B안 홈: http://127.0.0.1:3000/preview/b
- A안 대표 상세: http://127.0.0.1:3000/preview/a/product?id=surf-shortboard-60
- B안 대표 상세: http://127.0.0.1:3000/preview/b/product?id=surf-shortboard-60
- 대표 다크 화면: 각 홈 URL 뒤에 `?theme=dark`를 붙이거나 상단 테마 버튼을 사용한다.

미리보기의 상품명, 가격, 지역, 상태와 판매자 표시는 시안 비교를 위한 샘플 데이터다.
실제 서버 재고나 판매 실적을 의미하지 않으며, 실제 서버 오류를 샘플 데이터로 대체하지 않는다.

## 시안 A: 사진 중심 스포츠 편집숍

목표는 SummerGear를 단순 중고 마켓보다 서핑과 테니스를 함께 즐기는 라이프스타일 편집숍으로
보이게 하는 것이다.

- 비대칭 라이프스타일 이미지와 짧은 헤드라인을 첫 인상으로 사용한다.
- 종목 진입을 두 개의 큰 텍스트 영역으로 두고 상품 그리드를 바로 이어 붙였다.
- 모바일 390px 첫 화면에서도 첫 상품의 시작이 보이도록 히어로 높이를 제한했다.
- 상품 카드는 4:5 이미지 비율과 넉넉한 여백으로 사진의 존재감을 높였다.
- 검색을 전면에 두지 않아 B안과 정보 우선순위를 명확히 구분했다.

취업 포트폴리오의 첫 화면으로는 A안을 우선 추천한다. 브랜드 방향, 사진 사용, 반응형 구성과
상품 UI를 한 화면에서 함께 보여주기 좋아 시각적 차별화가 더 분명하다.

## 시안 B: 상품 중심 스포츠 마켓

목표는 사용자가 들어오자마자 장비를 찾고 비교하는 행동을 시작하게 하는 것이다.

- 제목 바로 아래에 검색과 종목 필터를 둔다.
- 작은 기획 이미지 영역 뒤에서 상품 그리드가 빠르게 시작한다.
- 정사각형 상품 사진과 더 조밀한 가격/상품 정보로 비교 효율을 높였다.
- 모바일 390px과 데스크톱 1440px 모두 첫 화면에서 상품 시작이 보인다.

실제 마켓의 탐색 전환과 상품 비교 효율을 우선한다면 B안이 더 적합하다.

## 공통 디자인 기준

색상은 기존 SummerGear 블루를 출발점으로 삼았다. 라이트는 `#f3f5f6` 배경,
`#111820` 본문, `#0369a1` 강조색을 사용한다. 다크는 `#0c1218` 배경,
`#f4f7fa` 본문, `#7dd3fc` 강조색을 사용한다.

새 폰트 의존성을 넣지 않고 기존 시스템/Pretendard 스택을 유지했다. 제목은 강한 자간과 짧은
행 길이, 본문은 여유 있는 행간으로 구분한다. 콘텐츠 최대 폭은 1,200px이고, 카드 간격은
데스크톱 약 14~18px, 모바일 8~10px을 기본으로 한다. 카드는 18px, 컨트롤은 10px의
일관된 라운드 규칙을 사용한다.

모바일은 2열, 중간 폭은 3열, 데스크톱은 4열 상품 그리드다. 상품 상세는 데스크톱에서 이미지와
상품 정보를 좌우로 나누고, 모바일에서는 한 열로 쌓으며 주요 행동을 하단에서 접근하기 쉽게 했다.

모든 원격 상품/라이프스타일 이미지는 고정 aspect-ratio 컨테이너 안에서 `object-fit: cover`로
표시한다. 이를 통해 이미지 다운로드 전에도 레이아웃 공간을 확보한다. 모션은 이미지 hover와
버튼 상태 변화에만 제한하고 `prefers-reduced-motion: reduce`에서 사실상 제거한다.

## 참고한 사이트와 적용 범위

2026-09-29에 아래 사이트를 직접 확인했다. 로고, 카피, 화면 구성과 이미지를 복제하지 않고
정보 위계만 참고했다.

- 29CM: 짧은 편집 카피에서 상품으로 자연스럽게 이어지는 편집숍형 흐름.
  https://www.29cm.co.kr/
- Saturdays NYC: 큰 시즌/라이프스타일 비주얼과 절제된 상품 정보 조합.
  https://www.saturdaysnyc.com/
- Patagonia Worn Wear: 검색과 상품 탐색을 빠르게 시작하는 마켓형 정보 위계.
  https://wornwear.patagonia.com/

## 이미지 자산

아래 이미지는 Unsplash 사진 페이지를 출처로 기록하고 원격 URL로 사용했다. 사용 조건은
https://unsplash.com/license 의 Unsplash License를 기준으로 확인했다. 현재 라이선스는 무료
상업/비상업 사용을 허용하고 출처 표시는 권장하며, 원본 이미지를 실질적 수정 없이 판매하거나
Unsplash와 유사한 경쟁 서비스를 만들기 위한 이미지 수집은 허용하지 않는다.

- Roman Raizen, surfboard on seashore:
  https://unsplash.com/photos/surfboard-on-seashore-28Mhs01R8r8
- DARKROOMLABS, surfboard laying on the sand:
  https://unsplash.com/photos/a-surfboard-laying-on-the-sand-of-a-beach-aIg2cFYxF00
- Daesun Kim, Yangyang lifeguard stand and surfboard:
  https://unsplash.com/photos/a-lifeguard-stand-on-the-beach-with-a-surfboard-L-VbuFhKYqw
- soonita omar, tennis racket and balls:
  https://unsplash.com/photos/tennis-racket-and-two-balls-on-court-lJ-Yf8gIwjw
- The Drink Break, pair of tennis rackets:
  https://unsplash.com/photos/a-pair-of-tennis-rackets-PfTxYrThwmM
- Marija Zaric, tennis racket on a wall:
  https://unsplash.com/photos/a-tennis-racket-is-hanging-on-a-brick-wall-WEM-KJxsru4
- Opollo Photography, tennis racket on court:
  https://unsplash.com/photos/a-tennis-racket-laying-on-a-tennis-court-mok2SI12Ax0

같은 종목의 액세서리 샘플에는 위 사진 일부를 반복 사용했다. 따라서 실제 서비스에 최종 적용할
때는 판매자가 올린 실제 상품 사진으로 대체해야 한다.

## 캡처

모든 A/B 비교 캡처는 동일한 샘플 데이터로 만들었다.

- `screenshots/a-mobile.png`, `screenshots/b-mobile.png`: 390 x 844
- `screenshots/a-desktop.png`, `screenshots/b-desktop.png`: 1440 x 900
- `screenshots/a-dark-mobile.png`, `screenshots/b-dark-mobile.png`: 390 x 844
- `screenshots/a-card.png`, `screenshots/b-card.png`: 1440px 홈에서 캡처한 대표 상품 카드
- `screenshots/a-detail-mobile.png`, `screenshots/b-detail-mobile.png`: 390 x 844
- `screenshots/a-detail-desktop.png`, `screenshots/b-detail-desktop.png`: 1440 x 900

## 실제 브라우저 검증

Chromium으로 최종 미리보기와 상세를 열어 확인했다.

- 모든 캡처 경로 HTTP 200, 콘솔/page error 0건.
- 390px A/B 홈과 상세에서 가로 overflow 0px, 잘린 버튼 0개.
- 1440px A/B 홈과 상세에서 가로 overflow 0px, 잘린 버튼 0개.
- 320px A/B 홈에서 가로 overflow 0px, 잘린 버튼 0개.
- 390px에서 첫 상품 상단: A 785px, B 788px, viewport 844px. 첫 화면에서 상품 이미지 시작이 보인다.
- 1440px에서 첫 상품 상단: A 860px, B 766px, viewport 높이 900px.
- 깨진 이미지 0개, placeholder fallback 0개, 관찰된 layout shift score 0.
- A 서핑 필터 8개, 재클릭 초기화 16개 확인.
- B `대구` 검색 결과 1개, 테니스 필터 8개 확인.
- 다크 테마 전환, 상세 찜 상태, 미연결 문의 안내 표시 확인.
- reduced-motion 환경을 실제로 에뮬레이션했으며 이미지 transition duration은 `1e-05s`로 축소됐다.

API, DB, 인증, 결제, 재고, 주문 상태, private Storage 계약은 수정하지 않았다.

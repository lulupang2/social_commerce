# 테스트 프로젝트 개선 · 1단계 검증 기록

2026-09-27 · 원본 `main` 작업 트리(HEAD `0cb22f9`)에서 수행. 기존 이미지·주문·결제 변경과 미추적 파일을 그대로 유지했다. 별도 브랜치/워크트리·커밋·push·배포 없음.

## 구현 범위

- 홈/마켓은 기본 서버 모드에서 Go와 기존 Supabase 매물만 표시한다. 데모는 명시적 선택 후 로컬/체험 매물만 표시한다. 서버 200 빈 목록, 401, 503/네트워크/잘못된 응답을 구분하고 오류에서 다시 시도한다. 서버 수치는 현재 받은 항목 수이며 전체 건수가 아니다.
- 출처별 식별자와 상세 링크(`?source=go|supabase|demo|local`)로 동일 ID의 Go/기존 매물이 섞이지 않는다. Go 찜은 로컬 키를 분리해 기존 Supabase 찜 쓰기 경로를 호출하지 않는다. 기존 직접 Supabase 조회와 데모 체험은 유지한다.
- 등록·수정 성공 시 목록 캐시를 무효화한다. 서버에 검토 대기 상태로 등록된 매물은 공개 목록에 임의로 추가하지 않으며 소유자 상세 조회를 유지한다. 이미지 업로드 재시도·서명 URL 갱신 흐름은 변경하지 않았다.
- 마이페이지에 `/orders` 진입점을 추가하고 주문 목록/상세/결제 화면의 명시적 마켓 복귀 경로를 제공한다. 결제 상태가 미확정인 동안 완료 문구를 숨긴다. 제공자를 알 수 없는 목록/상세에서는 중립적인 테스트 결제 문구, 설정이 확인된 결제 화면에서는 Toss 테스트/fixture 문구를 사용한다.

## 실행 결과

- `pnpm --filter @icegear/web exec tsx --test lib/listings/use-listings.test.ts lib/go-listings/order-display.test.ts lib/go-listings/images-lifecycle.test.ts`: 9/9 통과. 출처별 ID, Go 빈 목록·401·503, 상태 문구, 기존 이미지 재시도·교체 포함.
- 최종 묶음 `pnpm typecheck && pnpm --filter @icegear/web test && pnpm --filter @icegear/web lint && pnpm --filter @icegear/web build`: 타입 검사(domain/web/mobile), 웹 28/28, ESLint, Next 프로덕션 빌드 통과.
- 프로덕션 웹(`next start -p 3100`) 브라우저: 실제 API 미연결에서 서버 실패 및 재시도 표시 확인. 브라우저 **응답 모킹**에서는 Go 503 → 재시도 후 200 빈 목록 → 명시적 데모 전환(체험 매물 6건), 마이페이지 → 주문 목록(취소 확인 중) → 상세(성공 문구 없음) → 마켓, Go 출처 상세 링크 및 표시 확인. 이 검증은 실제 Go API/DB와 연결된 검증이 아니다.
- 마켓 수치 문구 수정 후 `pnpm --filter @icegear/web typecheck && pnpm --filter @icegear/web exec eslint app/market/page.tsx && pnpm --filter @icegear/web build` 재확인 통과. 재기동한 프로덕션 브라우저에서 Go 503 모킹 시 `조회 실패`·재시도·데모 전환 단추 확인.

재현: 프로덕션 웹을 로컬 포트 3100에서 실행하고 새 브라우저 탭에서 `/api/v1/listings`를 `{items:[]}`(200), `{message:\"unavailable\"}`(503)로 차례로 응답 모킹한다. 기존 Supabase 목록은 `[]`로 모킹한다. `/market`의 빈 화면·오류/재시도·데모 전환을 확인한다. 주문 동선은 테스트 회원 세션 응답과 `pending_cancel` 주문 1건을 `/api/v1/auth/session`, `/api/v1/orders`, `/api/v1/orders/{id}`에 모킹한 뒤 `/profile`에서 시작한다. 원격 실제 API 응답과 모킹은 섞어 통과로 집계하지 않는다.

## 남은 외부 확인과 후속 단계 발견

- 실제 Go API·격리 DB에서 등록→수정→목록 재조회, 실제 Storage 이미지 서명/재시도, Toss 테스트 키/실서비스 응답, 모바일 실기기 확인은 이번 환경에서 수행하지 않았다. API/DB 또는 외부 키가 필요한 검증과 브라우저 모킹 검증을 혼동하지 않는다.
- 2단계: 현재 프로필의 내 판매·찜·내 글 메뉴는 전체 목록으로 이동하고 수치는 실제 Go 회원 조회가 아니다.
- 3단계: Go 생성은 `pending_review`이며 공개 승인 경로와 구매 가능한 재고 준비가 별도다.
- 4단계: Go 목록 24개 제한과 브라우저 필터/현재 페이지 개수는 전체 검색/건수가 아니다.
- 5~6단계: 기존 채팅/커뮤니티는 Go 세션에 자동 연동되지 않으며 추천 이유는 실제 설정 기반 점수가 아니다. 이번 단계에서는 이 기능들을 구현하지 않았다.

계약 영향: HTTP/OpenAPI·도메인·DB migration·환경변수 변경 없음. 기존 주문 상태 및 이미지 계약은 유지했다.

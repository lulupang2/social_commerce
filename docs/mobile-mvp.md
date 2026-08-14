# 모바일 MVP 화면 가이드

이 문서는 2026-08-14 기준 Expo 모바일 MVP의 정보 구조와 데모 동작을 설명합니다. 색상과 간격은 코드의
`apps/mobile/lib/theme.ts`를 기준으로 하며, 특정 플랫폼의 픽셀 복제를 목표로 하지 않습니다.

## 하단 탭

| 탭 | 핵심 목적 | 현재 동작 |
| --- | --- | --- |
| 홈 | 가까운 겨울 스포츠 장비 탐색 | Supabase active listing, 검색, 스키/하키 필터, 찜 상태, 상품 상세 |
| 커뮤니티 | 장비·스팟·메이트 정보 교환 | Supabase active post 또는 demo feed, sport 필터, 상세, 로컬 좋아요/댓글, 작성 화면 |
| 판매 | 장비 등록 | 스포츠·카테고리·상태 chip, 가격/설명/거래지역 입력, 인증된 draft 저장 |
| 채팅 | 거래 문의 확인 | 인증 conversation 조회 또는 demo 대화, demo 로컬 메시지 전송, 실제 인증 메시지 insert 경계 |
| 나의 IceGear | 계정과 활동 진입점 | 로그인/게스트 진입, 판매·찜·커뮤니티 메뉴, 안내/설정 placeholder |

## 디자인 원칙

- 배경은 밝은 회색 `canvas`, 카드와 입력은 흰색 `surface`로 분리합니다.
- 당근마켓에서 학습한 지역 기반 탐색, 카드 중심 목록, coral 계열의 행동 색상을 사용하되 브랜드와 문구는 IceGear에 맞춥니다.
- 정보 우선순위는 `이미지 → 제목 → 가격 → 지역/시간 → 상태` 순서입니다.
- 모바일에서 한 손 조작을 위해 주요 등록/문의 행동은 하단 또는 floating action으로 노출합니다.
- 실제 상품 이미지가 없거나 placeholder가 실패하면 스포츠별 emoji fallback을 표시합니다.

## 타이포그래피

모바일 앱은 한 가지 폰트가 모든 역할을 담당하지 않도록 세 패밀리를 구분합니다.

| 역할 | 폰트 | 적용 대상 |
| --- | --- | --- |
| 기본 UI | Pretendard Regular/SemiBold/Bold | 본문, 상품명, 버튼, 탭, 입력, 채팅 |
| Display | Paperlogy 7Bold/8ExtraBold | 화면 제목, hero headline, 인증 headline |
| Accent | Barlow Condensed Bold | 영문 eyebrow, 가격 숫자, 통계 숫자 |

폰트 로딩과 굵기 매핑은 `apps/mobile/lib/typography.tsx`가 담당합니다. 일반 UI의 `fontWeight`는
Android가 임의로 굵기를 합성하지 않도록 실제 Pretendard 파일로 변환합니다. 앱에는 Variable Font가 아닌
사용 중인 정적 굵기 6개만 포함하고, native splash는 로딩 완료 후 닫습니다. 원본과 라이선스 정보는
`apps/mobile/assets/fonts/README.md`를 기준으로 관리합니다.

## 인증 경계

- 공개 read: active listing과 active community post입니다.
- 데모 read: Supabase가 없거나 인증 session이 없는 채팅은 시연 데이터로 안전하게 표시합니다.
- 인증 write: 판매글 draft, community post, conversation message는 `auth.uid()`와 RLS를 통과해야 합니다.
- 프로필의 게스트 시작은 Supabase Anonymous Auth 설정이 켜진 개발 환경에서만 동작합니다.

## 알려진 후속 작업

1. Supabase Realtime 기반 메시지 구독과 읽음 상태를 추가합니다.
2. comments/reactions/favorites를 repository와 RLS 정책에 연결합니다.
3. Storage 업로드·이미지 압축·신고/차단·moderation queue를 붙입니다.
4. 실제 Auth provider, profile onboarding, 계정 삭제/데이터 export 흐름을 확정합니다.
5. iOS/Android 실기기에서 safe-area, 키보드, 이미지 캐시, 폰트 줄바꿈, 접근성 스모크 테스트를 수행합니다.

# @icegear/domain

SummerGear의 프레임워크 독립 TypeScript/Zod 계약 패키지입니다. 패키지 이름은 기존 워크스페이스 호환을 위해 유지하지만 제품 도메인은 `surf`, `tennis`만 허용합니다.

루트와 `./schemas` 진입점에서 다음 계약을 제공합니다.

- 서핑·테니스 장비 상세와 매물 생성
- 프로필, 종목별 실력·사이즈·장비 선호
- 게시 검토·거절·복원 상태 전이와 감사 이벤트
- 커뮤니티 글·댓글·1인 1좋아요
- 결정적 맞춤 추천 입력·결과
- private 이미지 signed lifecycle
- 채팅 메시지
- WebView 이미지·햅틱·알림 브릿지 요청/응답

```bash
pnpm --filter @icegear/domain typecheck
pnpm --filter @icegear/domain test
pnpm --filter @icegear/domain build
```

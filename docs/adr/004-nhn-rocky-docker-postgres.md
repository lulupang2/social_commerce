# ADR 004: nhn-rocky와 Docker PostgreSQL

- 상태: 채택, 배포 구성 구현 전
- 결정일: 2026-09-18
- 범위: 배포·테스트 호스트와 DB 운영
- 대체 범위: [ADR 003](003-go-backend-and-social-auth.md)의 Supabase DB 호스팅 유지 기본안

> 후속 결정: Docker 운영 DB·새 migration 위치·큐 미선정 방침은 [ADR 005](005-supabase-river-toss-test.md)로 대체되었습니다. nhn-rocky 배포·테스트와 환경 격리는 유지합니다. 아래는 이전 결정의 이력입니다.

## 결정

1. 서비스 배포와 서버 측 테스트는 SSH 호스트 `nhn-rocky`에서 수행합니다.
2. Supabase DB 대신 Docker PostgreSQL을 운영합니다. Supabase 전체 스택을 Docker로 설치한다는 뜻은 아닙니다.
3. 운영과 테스트 DB·계정·볼륨·네트워크를 분리합니다. 기존 타 서비스와 자원을 임의 공유하지 않습니다.
4. 새 DB용 마이그레이션은 예정 경로 `apps/api/migrations`에서 관리합니다. 기존 `supabase/migrations`는 이전 환경 이력으로 보존합니다.
5. DB 백업·복구·패치·용량 관리는 자체 운영 책임으로 둡니다.

## 배경과 결과

사용자가 지정한 원격 환경에서 배포·테스트를 일관되게 수행하고 Go 백엔드와 일반 PostgreSQL로 전환합니다. 기존 Supabase 인증·Storage·Realtime 의존성은 DB 컨테이너로 대체되지 않으므로 개별 이전 계획이 필요합니다.

SSH 확인 시 Docker·Compose가 준비돼 있었고 다른 프로젝트가 실행 중이었습니다. 메모리 여유가 제한돼 테스트 동시 실행과 컨테이너 자원 제한을 검증해야 합니다. 이번 결정은 서버 용량이 운영 요구를 만족한다는 판정이 아닙니다.

작업 큐는 별도 선정합니다. BullMQ는 도입 가능하며 [검토 결과](../background-jobs.md)는 River를 우선 후보로 권고합니다. 어느 라이브러리도 아직 채택·설치하지 않았습니다.

## 관련 문서

- [배포·테스트 환경](../deployment.md)
- [백엔드 전환 설계](../backend-transition.md)
- [로드맵](../plan.md)

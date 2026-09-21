# SummerGear 저장소 작업 규칙

이 문서는 저장소 전체에 적용한다. 더 하위 경로에 별도 `AGENTS.md`가 있으면 그 경로에서는
하위 문서가 추가 지침이 된다. 사용자의 명시적 요청이 이 문서보다 우선한다.

## 먼저 확인할 것

작업을 시작하기 전에 다음을 확인한다.

1. `git status --short --branch`, `git worktree list`, 최근 커밋으로 현재 브랜치와 기존 변경을
   확인한다.
2. 요청과 관련된 구현, 테스트, 계약 문서를 함께 읽는다. 파일명이나 명령을 추측하지 않는다.
3. 기존 미커밋 변경과 다른 작업자의 변경을 보존한다. 명시적으로 요청받지 않은 초기화, stash,
   브랜치 전환, 워크트리 삭제를 하지 않는다.
4. 변경 범위와 필요한 검증을 정한 뒤 구현한다. 무관한 포맷 변경이나 리팩터링을 섞지 않는다.

`docs/work-orders/`는 이미지 기능을 병렬 구현할 때 사용한 작업 기록이다. 새 작업을 자동으로
A/B/C/D 역할에 배정하거나 새 에이전트·브랜치를 만들라는 상시 지시가 아니다.

## 저장소 구성과 기준 문서

- `apps/web`: Next.js App Router 웹 앱
- `apps/mobile`: Expo/React Native WebView 앱
- `apps/api`: Go Fiber API, River worker, migration CLI
- `packages/domain`: 웹과 모바일이 공유하는 TypeScript/Zod 계약
- `supabase/migrations`: 애플리케이션 DB 스키마, 권한, RLS 변경
- `ops/nhn-rocky`: 격리 DB fixture와 Linux 검증 도구
- `ops/deployment`: Docker 이미지, Compose, keyless CI와 배포 도구

관련 기준은 다음 순서로 함께 대조한다.

- 제품 범위와 결정: [docs/SSOT.md](docs/SSOT.md), [docs/plan.md](docs/plan.md)
- Go 전환과 인증: [docs/backend-transition.md](docs/backend-transition.md),
  [docs/authentication.md](docs/authentication.md)
- HTTP 기계 계약: `apps/api/openapi.yaml`
- 공통 프런트엔드 계약: `packages/domain`
- DB 계약: `supabase/migrations`와 현재 API 쿼리
- 매물 이미지 계약: [docs/listing-images.md](docs/listing-images.md)
- 배포 계약: [docs/deployment.md](docs/deployment.md),
  [ops/deployment/README.md](ops/deployment/README.md)

문서와 구현이 다르면 한쪽을 임의로 정답으로 간주하지 않는다. 실제 소비자, 테스트, migration을
확인하고 차이와 호환성 영향을 기록한 뒤 필요한 범위를 함께 정렬한다. 날짜가 적힌 계획·검증
기록은 당시 상태의 증거이며 현재 검증을 대신하지 않는다.

## 도구와 의존성

- Node.js는 `.node-version`과 `package.json#engines`를 따른다. 현재 최소 버전은 22.13.0이다.
- 패키지 관리자는 `packageManager`에 고정된 pnpm 10.34.5를 사용한다. npm/yarn lockfile을
  추가하지 않는다.
- Go 버전은 `apps/api/go.mod`를 따른다. Go 검증과 POSIX 권한 검사는 Linux에서 수행한다.
- 의존성 설치는 저장소 루트에서 `pnpm install --frozen-lockfile`을 우선 사용한다.
- 의존성을 실제로 변경한 경우에만 `package.json`, 관련 workspace manifest와 `pnpm-lock.yaml`을
  함께 갱신한다.
- `node_modules`, `.next`, `dist`, `build`, `.expo`, `.foundation-cache`, 로컬 바이너리와 테스트
  산출물을 커밋하지 않는다.

## 구현과 계약 변경

- API 변경은 라우터·핸들러·서비스·OpenAPI·웹 런타임 검증·테스트를 한 계약으로 취급한다.
  성공 응답뿐 아니라 인증, 소유권, 상태 충돌과 외부 서비스 장애 응답도 유지한다.
- 서버가 확인해야 하는 회원 ID, 객체 경로, 권한을 요청 바디나 브라우저 값만으로 신뢰하지 않는다.
  DB의 회원 컨텍스트는 트랜잭션 범위 밖으로 누출하지 않는다.
- 이미지 업로드, 정렬, 상태, 크기·차원 제한, 서명 URL과 복구 동작은
  `docs/listing-images.md`를 따른다. private bucket을 public URL처럼 취급하지 않는다.
- 실제 네이버·카카오 OAuth가 완성됐다고 가정하지 않는다. 테스트용 임시 로그인은 명시적인
  test 환경과 `AUTH_DEV_LOGIN_ENABLED` 가드 안에서만 유지한다.
- 적용된 migration을 수정하거나 번호를 재사용하지 않는다. 스키마 변경은 새 migration으로
  추가하고 기존 데이터, FK, RLS, 롤백/forward-fix 영향을 확인한다.
- Go API/worker가 애플리케이션 시작 중 migration을 수행하게 만들지 않는다. migration은 배포의
  단일 별도 단계로 유지한다.
- 테스트 통과를 위해 검증 삭제, 무근거 skip, 필수 의존성의 nil 연결, 기능 비활성화, 오류를
  성공 응답으로 변환하는 변경을 하지 않는다.

## 환경변수와 비밀

- 실제 변수 이름과 역할은 코드 검색과 `ops/nhn-rocky/.env.example`을 기준으로 확인한다.
  예시 파일에는 빈 값 또는 명확한 자리표시자만 둔다.
- DB URL, service-role key, OAuth secret, 세션 비밀, 서명 키는 코드·문서·로그·Docker build
  argument·커밋에 넣지 않는다.
- 서버 전용 값을 `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*` 또는 브라우저 응답에 노출하지 않는다.
  공개 접두사의 값은 클라이언트 번들에 포함된다고 간주한다.
- Storage는 Go API가 `SUPABASE_URL`에서 `/storage/v1`을 파생한다. 실제 코드에 별도 변수가 없는
  경우 새로운 endpoint 변수명을 만들지 않는다.
- `.env`, private key, 운영 DB를 테스트에 사용하지 않는다. 테스트는 명시적인 fixture나 격리된
  test 프로젝트를 사용하고 이번 실행에서 만든 자원만 정리한다.

## 검증 기준

변경 범위에 맞는 최소 검증을 실행하고, 실행하지 못한 검증은 통과로 표시하지 않는다.

### TypeScript와 Web

저장소 루트에서 다음을 사용한다.

```sh
pnpm typecheck
pnpm --filter @icegear/web test
pnpm --filter @icegear/web lint
pnpm --filter @icegear/web build
```

모바일이나 공통 도메인을 변경하면 해당 workspace의 typecheck/test/build 또는
`pnpm export:mobile:web`도 실행한다. 타입 검사만으로 브라우저 흐름이나 런타임 응답 계약이
검증됐다고 보지 않는다.

### Go와 DB

Linux의 `apps/api`에서 다음을 실행한다.

```sh
go test ./...
go vet ./...
go test -tags=integration ./... -run '^$'
```

변경한 Go 파일은 `gofmt`를 적용한다. integration 태그의 빈 실행은 컴파일 검사일 뿐 DB 통합
검사를 대신하지 않는다. 인증·매물·이미지·RLS를 변경하면 Linux 저장소 루트에서 다음 격리
검증을 실행한다.

```sh
bash ops/nhn-rocky/test-listings-database.sh
```

Go의 POSIX `0600` 권한 검사를 Windows 결과만으로 완화하거나 삭제하지 않는다. 실제 키가 필요한
검증, fixture 검증, 실제 서비스 연결 검증을 결과에서 구분한다.

### CI와 배포

CI/Docker/Compose를 변경하면 [ops/deployment/README.md](ops/deployment/README.md)의 keyless 명령을
사용한다. 최소한 두 Compose 파일의 `config --quiet`, 관련 Docker target build, keyless smoke를
확인한다. 무거운 이미지 빌드와 DB 통합 검사는 자원이 작은 호스트에서 병렬 실행하지 않는다.

배포 구성은 다음 경계를 유지한다.

- API, worker, migration, web 이미지는 역할별 entrypoint와 최소 권한 사용자를 유지한다.
- secret을 이미지에 bake하지 않고 runtime private env로 전달한다.
- Supabase test 배포와 운영 환경을 같은 marker나 credential로 혼용하지 않는다.
- migration 성공 후 API/worker를 시작하고 readiness 확인 후 트래픽을 연결한다.
- 배포 전 이미지 digest·migration 상태·백업을 기록하고, 앱 롤백과 DB 복구를 구분한다.
- 실제 배포, 키 등록, 원격 push는 사용자가 요청한 범위 안에서만 수행한다.

## Git과 병합

- 새 브랜치가 필요하면 기본적으로 `codex/` 접두사를 사용하되 현재 브랜치와 작업 지시를 먼저
  확인한다. 작은 단일 작업에 불필요한 워크트리를 만들지 않는다.
- 공통 계약, migration, lockfile, CI처럼 충돌 가능성이 큰 파일은 변경 이유와 소비자 영향을 함께
  기록한다.
- 충돌을 `ours` 또는 `theirs`로 일괄 해결하지 않는다. 양쪽 계약과 테스트를 비교해 유지·교체한
  내용을 검증한다.
- 커밋에는 이번 작업 파일만 명시적으로 포함한다. 기존 미추적 파일이나 다른 작업자의 변경을
  편의상 함께 추가하지 않는다.
- 로컬 브랜치·워크트리나 Docker 자원을 지우기 전에 대상 경로, 미커밋 변경, 병합 여부를 확인한다.
  원격 브랜치 삭제, push, force push, 배포는 명시적인 요청 없이 수행하지 않는다.

## 완료 보고

다음을 간단히 보고한다.

1. 변경한 파일과 사용자에게 보이는 동작
2. 계약·migration·환경변수 변경과 호환성 영향
3. 실행한 검증 명령과 실제 결과
4. 실행하지 못한 검증, 외부 키·서비스가 필요한 확인, 남은 위험
5. 생성한 브랜치·커밋과 원격 반영 여부

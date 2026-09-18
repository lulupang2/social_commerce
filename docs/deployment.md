# nhn-rocky 배포·테스트 환경

상태: 방향 확정, 서비스 배포 구성 구현 전 · 기준일: 2026-09-18

Go API·River worker·Next.js를 SSH 호스트 `nhn-rocky`에서 배포·테스트합니다. DB는 Supabase PostgreSQL을 유지합니다. Docker 운영 DB 계획은 [ADR 005](adr/005-supabase-river-toss-test.md)로 대체되었습니다.

## 확인한 환경

2026-09-18 읽기 전용 SSH 확인 결과입니다. 서비스 변경이나 배포를 수행한 기록은 아닙니다. 배포 직전에 다시 확인합니다.

| 항목             | 관측값                                       |
| ---------------- | -------------------------------------------- |
| OS               | Rocky Linux 9.8                              |
| Docker / Compose | 29.8.0 / v5.5.1, SSH 사용자 실행 가능        |
| RAM              | 약 1.9GiB, 당시 available 약 642MiB          |
| Swap             | 약 2GiB, 당시 약 623MiB 사용                 |
| 루트 디스크      | 약 19GiB, 당시 가용 약 11GiB                 |
| 기존 서비스      | 다른 프로젝트의 web·api·worker·Redis 실행 중 |

기존 서비스의 컨테이너·네트워크·포트·Redis를 임의 공유하거나 변경하지 않습니다. 빌드·테스트는 순차 실행하고 메모리·디스크 사용량과 기존 서비스 지연을 관찰합니다. 필요시 증설을 결정하며 Swap을 RAM 대체로 간주하지 않습니다.

## 목표 배포

| 구성          | 위치·책임                                                                  |
| ------------- | -------------------------------------------------------------------------- |
| gateway       | nhn-rocky, TLS·동일 출처 `/api/v1` 라우팅; 기존 프록시 연계는 조사 후 결정 |
| web           | nhn-rocky, Next.js 운영 서버                                               |
| api           | nhn-rocky, Go + Fiber, 네이버·카카오 로그인과 거래 API                     |
| worker        | nhn-rocky, River 작업 실행; API와 별도 프로세스                            |
| PostgreSQL    | Supabase 호스팅 유지, 업무 데이터·River 큐 저장                            |
| 테스트 실행기 | nhn-rocky, 테스트할 때만 실행                                              |

Compose를 앱 배포 기본안으로 둡니다. 운영용 PostgreSQL·Redis 컨테이너는 추가하지 않습니다. 도메인·포트·원격 저장소 경로·배포 디렉터리와 이미지 버전은 실제 구현 전에 확인합니다.

## Supabase 연결

Go는 Supabase REST API용 publishable key가 아닌 PostgreSQL 연결 정보로 접속합니다. migration·API·worker 계정을 분리하고 필요한 DB 권한만 부여합니다. 비밀번호가 포함된 연결 문자열은 서버 비밀 설정에 저장하고 로그·문서·채팅에 출력하지 않습니다.

직접 연결 또는 session pooler를 우선 검증합니다. nhn-rocky의 네트워크·IPv4/IPv6·TLS·프로젝트 연결 수 제한을 확인합니다. River coordinator의 `LISTEN/NOTIFY` 연결에 transaction pooler를 그대로 사용하지 않습니다. API만 transaction pooling을 쓰는 경우에도 준비된 문장·트랜잭션 설정과 드라이버 호환성을 검증합니다. [Supabase 연결 문서](https://supabase.com/docs/guides/database/connecting-to-postgres), [River 연결 문서](https://riverqueue.com/docs/pgbouncer)

API·worker의 총 연결 수와 낮은 초기 worker 동시성을 설정해 부하를 측정합니다. River 스키마를 공개 Data API에 노출하지 않고 브라우저 역할에는 읽기·쓰기 권한을 주지 않습니다.

## 운영과 테스트 분리

기본안은 테스트 전용 Supabase 프로젝트입니다. 테스트 앱·worker는 이 프로젝트만 사용하고 운영 연결 정보를 전달받지 않습니다. 결제는 토스페이먼츠 테스트 키, 알림은 테스트 수신처만 사용합니다.

테스트 코드는 nhn-rocky에서 실행하고 테스트 DB는 별도 Supabase에 연결합니다. 파괴적·반복 DB 테스트에 일회성 Docker DB를 사용할 수 있지만 이는 운영 DB 이전과 별개입니다. 해당 테스트가 Supabase의 auth·storage 스키마에 의존하면 호환 테스트 스택을 준비하거나 전용 Supabase 테스트 환경에서 검증합니다. 순정 PostgreSQL에 기존 SQL을 그대로 실행하지 않습니다.

테스트 앱과 운영 앱은 도메인·컨테이너·환경변수·큐 DB를 분리합니다. 큐 이름만 다르게 두고 같은 운영 데이터에 접근하는 것으로 격리를 대신하지 않습니다. 파괴적 테스트는 대상 환경을 검증하고 해당 실행 자원만 정리합니다.

## 스키마와 인증 전환

앱 변경은 `supabase/migrations`에 추가합니다. River 공식 migration은 고정한 라이브러리 버전과 적용 기록을 따로 관리하고 배포 시 일회성 단계에서 실행합니다. API·worker가 동시에 migration을 수행하지 않습니다.

DB 호스팅은 유지하지만 Go 인증으로 바꾸기 위해 `auth.users` FK·삭제 전파, `auth.uid()`·RLS, Storage·Realtime의 사용자 인증 의존성을 점검해야 합니다. 기존 사용자 ID와 데이터를 보존하면서 이전하고 기존 Auth 사용자를 먼저 삭제하지 않습니다. Go 세션이 기존 Supabase 서비스에 자동 인식되지는 않습니다.

Storage·Realtime의 호스팅 변경은 이번 결정에 포함하지 않습니다. 해당 기능을 계속 사용할 경우 Go 인증과의 안전한 연계 방식을 확정하고 검증해야 합니다.

## 배포·복구 순서

1. 원격 저장소·커밋·미커밋 변경을 확인합니다. 로컬 문서가 원격에 자동 동기화되었다고 가정하지 않습니다.
2. 테스트 전용 연결·키로 migration과 가상 시드를 적용합니다.
3. nhn-rocky에서 Go 단위·통합 테스트, 권한·세션·재고 경쟁·River 재시도, 웹 검사·빌드를 순차 실행합니다.
4. 테스트 도메인에 배포해 OAuth·토스페이먼츠 승인·조회·취소·웹훅을 확인합니다. 모바일 복귀는 실제 기기에서도 검증합니다.
5. 커밋·이미지·실행 명령·환경·결과를 기록합니다. 이번 목표는 테스트 배포이며 실결제·실지급을 켜지 않습니다.

Supabase 플랜별 백업·복구 기능을 확인하고 중요한 스키마 변경 전에 별도 복원 검증을 합니다. 파괴적 migration을 피하고 앱 이전 버전과 데이터 호환성을 확보합니다. 외부 PG 결과는 DB rollback으로 되돌아가지 않으므로 대조 작업으로 복구합니다.

## 준비할 정보

원격 저장소 경로, 테스트 도메인, Supabase 테스트 프로젝트·연결 설정 파일 위치, 소셜 앱·PG 테스트 키 준비 여부가 필요합니다. 구체적인 사용자 준비 사항은 [테스트 결제 준비](payment-test-setup.md)를 따릅니다.

## 원격 작업 환경 준비

저장소와 비밀 설정 파일을 준비하는 절차는 [nhn-rocky 작업 환경](../ops/nhn-rocky/README.md)에 있습니다. 준비 브랜치는 `codex/nhn-rocky-setup`, 원격 경로는 `/home/rocky/projects/socialapp`입니다. 실행·배포는 별도 단계이며 Go·River 구성은 아직 구현 전입니다.

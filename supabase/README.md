# Supabase 스키마

이 디렉터리는 IceGear MVP용 PostgreSQL 스키마를 담습니다.

- `migrations/0001_init.sql`은 테이블, enum, 인덱스, timestamp/status 트리거,
  소유권 검사, Row Level Security(RLS) 정책을 생성합니다.
- `seed.sql`은 초기 스포츠 카탈로그를 넣습니다. 실제 Supabase Auth 사용자와 연결되어야 하는
  profile이나 사용자 콘텐츠는 의도적으로 만들지 않습니다.

## 전제조건

1. migration은 `auth.users`와 `auth.uid()`가 존재하는 Supabase 프로젝트에서 실행합니다.
   `socialapp_on_auth_user_created` 트리거가 Auth 사용자 생성 후 profile을 자동으로 만듭니다.
   배포 환경이 profile을 직접 생성한다면 트리거를 제거하고 `profiles` 테이블만 유지할 수 있습니다.
2. UUID는 PostgreSQL `pgcrypto` 확장의 `gen_random_uuid()`로 생성합니다.
   Supabase에서 제공되는 이 확장만 migration에서 요청합니다.
3. API는 Supabase Auth로 사용자를 인증하고, RLS는 `auth.uid()`와 소유권을 비교합니다.
   신뢰된 서버/service-role 연결은 import와 moderation에 사용할 수 있지만 키를 클라이언트에 노출하면 안 됩니다.
4. `profiles.role`이 `user`, `moderator`, `admin`의 기준입니다.
   관리자 또는 신뢰된 서버만 role 승격이나 `is_banned` 변경을 수행해야 하며,
   일반 사용자 세션의 변경은 트리거가 거부합니다.
5. `reports.target_id`는 listing, post, comment, profile, message, review를 가리킬 수 있는
   다형성 참조입니다. API는 삽입 전에 대상이 존재하고 `target_type`과 일치하는지 검증해야 합니다.

## 공개 범위와 소유권

- `listings.status = 'active'`와 `community_posts.status = 'active'`는 공개됩니다.
  판매자/작성자는 자신의 비공개 행도 읽을 수 있고, moderator/admin은 전체를 검토할 수 있습니다.
- profile은 기본적으로 소유자와 moderation 담당자에게만 공개됩니다.
  listing/post 응답에서 판매자나 작성자 정보를 노출해야 한다면 명시적인 view 또는 서버 요약을 사용합니다.
- listing image는 listing의 공개 범위를 따릅니다. favorites와 blocks는 소유자에게만 공개됩니다.
- conversation과 message는 buyer/seller 참여자만 읽고 쓸 수 있으며, 신고 처리를 위해 moderation 읽기 권한을 둘 수 있습니다.
  message 작성자는 자신의 message를 수정/삭제할 수 있고, 상대방은 읽음 상태만 변경할 수 있습니다.
- comment는 comment 자체와 부모 post가 모두 active일 때만 공개됩니다. 게시된 review는 공개되며,
  참여자는 자신의 숨김/삭제 행을 계속 확인할 수 있습니다.

## JSON listing 상세 정보

`listings.details`는 스포츠별 속성을 매번 migration하지 않고 확장할 수 있도록 필수 JSON object로 둡니다.
초기 카탈로그는 `ski`와 `hockey`입니다.

```json
{
  "brand": "CCM",
  "size": "M",
  "notes": "블레이드에 약간의 사용 흔적이 있습니다",
  "position": "goalie"
}
```

데이터베이스는 `details`가 object인지 확인하지만 스포츠별 단일 스키마까지 강제하지는 않습니다.
API는 `sports.slug`를 기준으로 도메인 스키마를 적용해야 합니다.

## 상태 전이

트리거는 실수로 인한 상태 건너뛰기를 거부합니다.

- Listing: `draft -> pending_review|active|archived|removed`,
  `pending_review -> draft|active|archived|removed`,
  `active -> reserved|sold|archived|removed`,
  `reserved -> active|sold|archived|removed`, `sold -> archived`,
  `archived -> active|removed`.
- Community post: `draft -> active|deleted`, `active -> hidden|deleted`,
  `hidden -> active|deleted`.
- Report: `open -> in_review|resolved|dismissed`, 이후 `in_review -> resolved|dismissed`.

콘텐츠 moderation은 행을 물리 삭제하기보다 status 필드로 숨김/삭제를 표현합니다.
timestamp는 UTC `timestamptz`이고, 변경 가능한 테이블의 `updated_at`은 트리거가 갱신합니다.

## 로컬 적용

Supabase CLI를 설정한 뒤 다음 명령으로 로컬 데이터베이스를 초기화하고 migration과 seed를 적용합니다.

```bash
supabase start
supabase db reset
```

호스팅 프로젝트에서는 프로젝트를 연결한 뒤 `supabase db push`를 사용합니다.
배포된 `0001_init.sql`을 수정하지 말고, 이후 스키마 변경은 순서가 있는 새 migration 파일로 추가합니다.

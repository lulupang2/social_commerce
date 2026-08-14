import type { CommunityPostType, Sport } from '@icegear/domain';

import { supabase } from '../supabase/client';
import { formatTime } from '../theme';

export type CommunityPostPreview = {
  id: string;
  authorId: string;
  authorName: string;
  authorInitial: string;
  sport?: Sport;
  type: CommunityPostType;
  title: string;
  body: string;
  commentCount: number;
  reactionCount: number;
  createdAt: string;
  timeLabel: string;
  isDemo?: boolean;
};

export type CommunityRepositoryResult<T> =
  | { data: T; error: null }
  | { data: null; error: { code: 'unauthenticated' | 'request_failed'; message: string } };

const DEMO_POSTS: CommunityPostPreview[] = [
  {
    id: 'demo-post-1',
    authorId: 'demo-sora',
    authorName: '스키타는 소라',
    authorInitial: '소',
    sport: 'ski',
    type: 'question',
    title: '초보자 첫 스키, 길이 어떻게 고르세요?',
    body: '이번 시즌에 처음 스키를 시작하려고 해요. 키 168cm인데 160cm 전후로 보면 될까요? 입문자에게 추천하는 모델도 궁금합니다.',
    commentCount: 12,
    reactionCount: 24,
    createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
    timeLabel: '어제',
    isDemo: true,
  },
  {
    id: 'demo-post-2',
    authorId: 'demo-rink',
    authorName: '링크버디',
    authorInitial: '링',
    sport: 'hockey',
    type: 'guide',
    title: '하키 스케이트 처음 사는 분들을 위한 체크리스트',
    body: '발볼, 열성형, 홀더 높이만 확인해도 실패 확률이 크게 줄어요. 직접 신어보고 체크할 포인트를 정리했습니다.',
    commentCount: 8,
    reactionCount: 41,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    timeLabel: '3일 전',
    isDemo: true,
  },
  {
    id: 'demo-post-3',
    authorId: 'demo-mountain',
    authorName: '산 아래 장비함',
    authorInitial: '산',
    sport: 'ski',
    type: 'event',
    title: '이번 주말 용평 같이 타실 분 있나요?',
    body: '토요일 오전에 용평 레인보우로 갑니다. 초중급 슬로프 위주로 함께 타고 점심 먹어요.',
    commentCount: 5,
    reactionCount: 17,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    timeLabel: '5일 전',
    isDemo: true,
  },
  {
    id: 'demo-post-4',
    authorId: 'demo-ice',
    authorName: '아이스하키 주말반',
    authorInitial: '아',
    sport: 'hockey',
    type: 'discussion',
    title: '서울 동쪽 아이스링크 추천해주세요',
    body: '잠실과 광진 쪽에서 평일 저녁에 이용하기 좋은 링크를 찾고 있어요. 대관 정보도 공유 부탁드립니다.',
    commentCount: 19,
    reactionCount: 33,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    timeLabel: '7일 전',
    isDemo: true,
  },
];

const TYPE_LABELS: Record<CommunityPostType, string> = {
  discussion: '이야기',
  question: '질문',
  guide: '가이드',
  review: '후기',
  event: '모임',
  announcement: '공지',
};

export function communityTypeLabel(type: CommunityPostType): string {
  return TYPE_LABELS[type];
}

export function demoCommunityPosts(): CommunityPostPreview[] {
  return DEMO_POSTS.map((post) => ({ ...post }));
}

export async function listCommunityPosts(): Promise<CommunityPostPreview[]> {
  if (!supabase) return demoCommunityPosts();

  const { data, error } = await supabase
    .from('community_posts')
    .select('id,author_id,title,body,status,published_at,created_at,updated_at,sports(slug)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error || !data?.length) return demoCommunityPosts();

  return data.map((row) => {
    const relation = Array.isArray(row.sports) ? row.sports[0] : row.sports;
    const sport =
      relation?.slug === 'ski' || relation?.slug === 'hockey' ? relation.slug : undefined;
    return {
      id: row.id,
      authorId: row.author_id,
      authorName: 'IceGear 회원',
      authorInitial: 'I',
      sport,
      type: 'discussion',
      title: row.title,
      body: row.body,
      commentCount: 0,
      reactionCount: 0,
      createdAt: row.created_at,
      timeLabel: formatTime(row.created_at),
    } satisfies CommunityPostPreview;
  });
}

export async function getCommunityPost(id: string): Promise<CommunityPostPreview | null> {
  const demo = DEMO_POSTS.find((post) => post.id === id);
  if (demo || !supabase) return demo ? { ...demo } : null;

  const { data, error } = await supabase
    .from('community_posts')
    .select('id,author_id,title,body,status,published_at,created_at,updated_at,sports(slug)')
    .eq('id', id)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) return null;

  const relation = Array.isArray(data.sports) ? data.sports[0] : data.sports;
  const sport = relation?.slug === 'ski' || relation?.slug === 'hockey' ? relation.slug : undefined;
  return {
    id: data.id,
    authorId: data.author_id,
    authorName: 'IceGear 회원',
    authorInitial: 'I',
    sport,
    type: 'discussion',
    title: data.title,
    body: data.body,
    commentCount: 0,
    reactionCount: 0,
    createdAt: data.created_at,
    timeLabel: formatTime(data.created_at),
  };
}

export async function createCommunityPost(input: {
  title: string;
  body: string;
  sport?: Sport;
}): Promise<CommunityRepositoryResult<CommunityPostPreview>> {
  if (!supabase) {
    return {
      data: null,
      error: { code: 'unauthenticated', message: '로그인 후 글을 작성할 수 있어요.' },
    };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return {
      data: null,
      error: { code: 'unauthenticated', message: '로그인 후 글을 작성할 수 있어요.' },
    };
  }

  let sportId: string | null = null;
  if (input.sport) {
    const sportResult = await supabase
      .from('sports')
      .select('id')
      .eq('slug', input.sport)
      .maybeSingle();
    if (sportResult.error) {
      return {
        data: null,
        error: { code: 'request_failed', message: '스포츠 정보를 불러오지 못했어요.' },
      };
    }
    sportId = sportResult.data?.id ?? null;
  }

  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      author_id: authData.user.id,
      sport_id: sportId,
      title: input.title.trim(),
      body: input.body.trim(),
      status: 'active',
      published_at: new Date().toISOString(),
    })
    .select('id,author_id,title,body,status,published_at,created_at,updated_at,sports(slug)')
    .single();

  if (error || !data) {
    return { data: null, error: { code: 'request_failed', message: '글을 저장하지 못했어요.' } };
  }

  const relation = Array.isArray(data.sports) ? data.sports[0] : data.sports;
  const sport = relation?.slug === 'ski' || relation?.slug === 'hockey' ? relation.slug : undefined;
  return {
    data: {
      id: data.id,
      authorId: data.author_id,
      authorName: '나',
      authorInitial: '나',
      sport,
      type: 'discussion',
      title: data.title,
      body: data.body,
      commentCount: 0,
      reactionCount: 0,
      createdAt: data.created_at,
      timeLabel: '방금 전',
    },
    error: null,
  };
}

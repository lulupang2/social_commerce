import { formatTime } from '../format';
import type { CommunityCommentPreview, CommunityPostPreview } from './types';

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

function demoPost(
  value: Omit<
    CommunityPostPreview,
    | 'author'
    | 'authorName'
    | 'authorInitial'
    | 'counts'
    | 'commentCount'
    | 'reactionCount'
    | 'createdAt'
    | 'updatedAt'
    | 'timeLabel'
    | 'isOwner'
    | 'isDemo'
  > & {
    authorName: string;
    commentCount: number;
    likeCount: number;
    ageMs: number;
  },
): CommunityPostPreview {
  const createdAt = new Date(Date.now() - value.ageMs).toISOString();
  const initial = Array.from(value.authorName)[0] ?? 'I';
  return {
    id: value.id,
    authorId: value.authorId,
    author: {
      id: value.authorId,
      displayName: value.authorName,
      initial,
    },
    authorName: value.authorName,
    authorInitial: initial,
    ...(value.sport ? { sport: value.sport } : {}),
    type: value.type,
    status: value.status,
    title: value.title,
    body: value.body,
    counts: {
      commentCount: value.commentCount,
      likeCount: value.likeCount,
    },
    commentCount: value.commentCount,
    reactionCount: value.likeCount,
    createdAt,
    updatedAt: createdAt,
    publishedAt: createdAt,
    timeLabel: formatTime(createdAt),
    isOwner: false,
    isDemo: true,
  };
}

export function createDemoCommunityPosts(): CommunityPostPreview[] {
  return [
    demoPost({
      id: 'demo-post-1',
      authorId: 'demo-sora',
      authorName: '스키타는 소라',
      sport: 'ski',
      type: 'question',
      status: 'active',
      title: '초보자 첫 스키, 길이 어떻게 고르세요?',
      body: '이번 시즌에 처음 스키를 시작하려고 해요. 키 168cm인데 160cm 전후로 보면 될까요?',
      commentCount: 2,
      likeCount: 24,
      ageMs: 36 * HOUR,
    }),
    demoPost({
      id: 'demo-post-2',
      authorId: 'demo-rink',
      authorName: '링크버디',
      sport: 'hockey',
      type: 'guide',
      status: 'active',
      title: '하키 스케이트 처음 사는 분들을 위한 체크리스트',
      body: '발볼, 열성형, 홀더 높이만 확인해도 실패 확률이 크게 줄어요.',
      commentCount: 1,
      likeCount: 41,
      ageMs: 3 * DAY,
    }),
    demoPost({
      id: 'demo-post-3',
      authorId: 'demo-mountain',
      authorName: '산 아래 장비함',
      sport: 'ski',
      type: 'event',
      status: 'active',
      title: '이번 주말 용평 같이 타실 분 있나요?',
      body: '토요일 오전에 용평 레인보우로 갑니다. 초중급 슬로프 위주로 함께 타요.',
      commentCount: 0,
      likeCount: 17,
      ageMs: 5 * DAY,
    }),
    demoPost({
      id: 'demo-post-4',
      authorId: 'demo-ice',
      authorName: '아이스하키 주말반',
      sport: 'hockey',
      type: 'discussion',
      status: 'active',
      title: '서울 동쪽 아이스링크 추천해주세요',
      body: '잠실과 광진 쪽에서 평일 저녁에 이용하기 좋은 링크를 찾고 있어요.',
      commentCount: 0,
      likeCount: 33,
      ageMs: 7 * DAY,
    }),
  ];
}

function demoComment(value: {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  body: string;
  ageMs: number;
}): CommunityCommentPreview {
  const createdAt = new Date(Date.now() - value.ageMs).toISOString();
  const initial = Array.from(value.authorName)[0] ?? 'I';
  return {
    id: value.id,
    postId: value.postId,
    authorId: value.authorId,
    author: { id: value.authorId, displayName: value.authorName, initial },
    authorName: value.authorName,
    authorInitial: initial,
    body: value.body,
    createdAt,
    updatedAt: createdAt,
    timeLabel: formatTime(createdAt),
    isMine: false,
    isDemo: true,
  };
}

export function createDemoCommunityComments(): CommunityCommentPreview[] {
  return [
    demoComment({
      id: 'demo-comment-1',
      postId: 'demo-post-1',
      authorId: 'demo-rink',
      authorName: '링크버디',
      body: '입문이라면 키보다 5~10cm 짧게 시작해도 다루기 편해요.',
      ageMs: 20 * HOUR,
    }),
    demoComment({
      id: 'demo-comment-2',
      postId: 'demo-post-1',
      authorId: 'demo-mountain',
      authorName: '산 아래 장비함',
      body: '렌탈로 몇 번 타보고 선호하는 회전 반경을 확인해보세요.',
      ageMs: 18 * HOUR,
    }),
    demoComment({
      id: 'demo-comment-3',
      postId: 'demo-post-2',
      authorId: 'demo-ice',
      authorName: '아이스하키 주말반',
      body: '열성형 가능 여부를 매장에서 꼭 확인하는 게 좋았습니다.',
      ageMs: 2 * DAY,
    }),
  ];
}

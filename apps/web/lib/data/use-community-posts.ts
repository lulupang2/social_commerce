'use client';

import { useEffect, useMemo, useState } from 'react';

import { createBrowserSupabaseClient } from '../supabase/browser';
import type { Database } from '../supabase/database.types';
import { getLocalPosts, LOCAL_STORE_EVENT } from './local-store';
import { SUMMER_COMMUNITY_POSTS, type MockCommunityPost } from './summer-mock-data';

type CommunityPostRow = Database['public']['Tables']['community_posts']['Row'];
type PublicAuthorRow = Database['public']['Views']['public_community_authors']['Row'];

const CATEGORY_LABELS: Record<MockCommunityPost['category'], string> = {
  tip: '스포츠 꿀팁',
  review: '장비 사용기',
  meetup: '세션 / 모임',
  discussion: '자유 수다 / Q&A',
};

let remoteCache: MockCommunityPost[] | null = null;
let remoteRequest: Promise<MockCommunityPost[] | null> | null = null;

function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '최근';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

async function loadRemotePosts(): Promise<MockCommunityPost[] | null> {
  if (remoteCache) return remoteCache;
  if (remoteRequest) return remoteRequest;

  const client = createBrowserSupabaseClient();
  if (!client) return null;

  remoteRequest = (async () => {
    const { data: posts, error } = await client
      .from('community_posts')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !posts || posts.length === 0) return null;

    const authorIds = Array.from(new Set(posts.map((post) => post.author_id)));
    const sportIds = Array.from(
      new Set(posts.flatMap((post) => (post.sport_id ? [post.sport_id] : []))),
    );
    const postIds = posts.map((post) => post.id);
    const [authorsResult, sportsResult, reactionsResult, commentsResult] = await Promise.all([
      client
        .from('public_community_authors')
        .select('id,display_name,avatar_url')
        .in('id', authorIds),
      sportIds.length > 0
        ? client.from('sports').select('id,slug,name').in('id', sportIds)
        : Promise.resolve({ data: [], error: null }),
      client
        .from('community_post_reaction_counts')
        .select('post_id,like_count')
        .in('post_id', postIds),
      client.from('comments').select('post_id').in('post_id', postIds).eq('status', 'active'),
    ]);

    const authorById = new Map(
      ((authorsResult.data ?? []) as PublicAuthorRow[]).flatMap((author) =>
        author.id ? [[author.id, author] as const] : [],
      ),
    );
    const sportById = new Map(
      (sportsResult.data ?? []).map((sport) => [sport.id, sport.slug] as const),
    );
    const likesByPost = new Map(
      (reactionsResult.data ?? []).flatMap((row) =>
        row.post_id ? [[row.post_id, Number(row.like_count ?? 0)] as const] : [],
      ),
    );
    const commentsByPost = new Map<string, number>();
    for (const comment of commentsResult.data ?? []) {
      commentsByPost.set(comment.post_id, (commentsByPost.get(comment.post_id) ?? 0) + 1);
    }

    const mapped = (posts as CommunityPostRow[]).flatMap((post) => {
      const sportSlug = post.sport_id ? sportById.get(post.sport_id) : null;
      if (sportSlug !== 'surf' && sportSlug !== 'tennis') return [];
      const fallback =
        SUMMER_COMMUNITY_POSTS.find((item) => item.sport === sportSlug) ??
        SUMMER_COMMUNITY_POSTS[0];
      const author = authorById.get(post.author_id);
      const category: MockCommunityPost['category'] =
        post.post_type === 'guide'
          ? 'tip'
          : post.post_type === 'review'
            ? 'review'
            : post.post_type === 'meetup'
              ? 'meetup'
              : 'discussion';

      return [
        {
          id: post.id,
          sport: sportSlug,
          sportLabel: sportSlug === 'surf' ? '서핑' : '테니스',
          category,
          categoryLabel: CATEGORY_LABELS[category],
          title: post.title,
          content: post.body,
          author: {
            name: author?.display_name ?? 'SummerGear 크루',
            avatar: author?.avatar_url ?? fallback.author.avatar,
            level: sportSlug === 'surf' ? '서핑 크루' : '테니스 크루',
          },
          likes: likesByPost.get(post.id) ?? 0,
          comments: commentsByPost.get(post.id) ?? 0,
          createdAt: relativeTime(post.published_at ?? post.created_at),
        } satisfies MockCommunityPost,
      ];
    });

    remoteCache = mapped.length > 0 ? mapped : null;
    return remoteCache;
  })()
    .catch(() => null)
    .finally(() => {
      remoteRequest = null;
    });

  return remoteRequest;
}

export function useCommunityPosts(): MockCommunityPost[] {
  const [remotePosts, setRemotePosts] = useState<MockCommunityPost[] | null>(remoteCache);
  const [localPosts, setLocalPosts] = useState<MockCommunityPost[]>([]);

  useEffect(() => {
    const refresh = () => setLocalPosts(getLocalPosts());
    refresh();
    window.addEventListener(LOCAL_STORE_EVENT, refresh);

    let active = true;
    void loadRemotePosts().then((posts) => {
      if (active) setRemotePosts(posts);
    });
    return () => {
      active = false;
      window.removeEventListener(LOCAL_STORE_EVENT, refresh);
    };
  }, []);

  return useMemo(() => {
    const base = remotePosts && remotePosts.length > 0 ? remotePosts : SUMMER_COMMUNITY_POSTS;
    const localIds = new Set(localPosts.map((post) => post.id));
    return [...localPosts, ...base.filter((post) => !localIds.has(post.id))];
  }, [localPosts, remotePosts]);
}

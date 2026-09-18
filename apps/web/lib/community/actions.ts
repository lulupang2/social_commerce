'use client';

import { createCommunityCommentSchema, uuidSchema } from '@icegear/domain';

import { createBrowserSupabaseClient } from '../supabase/browser';

export interface CommunityCommentView {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export async function loadCommunityComments(
  postId: string,
): Promise<CommunityCommentView[] | null> {
  if (!uuidSchema.safeParse(postId).success) return null;
  const client = createBrowserSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('comments')
    .select('id,body,created_at')
    .eq('post_id', postId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) return null;

  return (data ?? []).map((comment) => ({
    id: comment.id,
    author: 'SummerGear 크루',
    body: comment.body,
    createdAt: comment.created_at,
  }));
}

export async function addCommunityComment(
  postId: string,
  body: string,
): Promise<
  | { ok: true; comment: CommunityCommentView }
  | { ok: false; reason: 'unauthenticated' | 'invalid' | 'request_failed'; message: string }
> {
  const parsed = createCommunityCommentSchema.safeParse({ postId, body });
  if (!parsed.success) {
    return { ok: false, reason: 'invalid', message: '댓글 내용을 확인해 주세요.' };
  }

  const client = createBrowserSupabaseClient();
  if (!client) {
    return { ok: false, reason: 'request_failed', message: '댓글 서버 연결 정보가 없어요.' };
  }
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return { ok: false, reason: 'unauthenticated', message: '댓글을 쓰려면 로그인해 주세요.' };
  }

  const { data, error } = await client
    .from('comments')
    .insert({ post_id: parsed.data.postId, author_id: userData.user.id, body: parsed.data.body })
    .select('id,body,created_at')
    .single();
  if (error || !data) {
    return { ok: false, reason: 'request_failed', message: '댓글을 저장하지 못했어요.' };
  }

  return {
    ok: true,
    comment: {
      id: data.id,
      author: '나',
      body: data.body,
      createdAt: data.created_at,
    },
  };
}

export async function setCommunityLike(
  postId: string,
  liked: boolean,
): Promise<
  { ok: true } | { ok: false; reason: 'unauthenticated' | 'request_failed'; message: string }
> {
  if (!uuidSchema.safeParse(postId).success) return { ok: true };
  const client = createBrowserSupabaseClient();
  if (!client)
    return { ok: false, reason: 'request_failed', message: '좋아요 서버에 연결할 수 없어요.' };

  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return {
      ok: false,
      reason: 'unauthenticated',
      message: '좋아요는 로그인 후 사용할 수 있어요.',
    };
  }

  const operation = liked
    ? client.from('community_reactions').upsert({ post_id: postId, user_id: userData.user.id })
    : client
        .from('community_reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userData.user.id);
  const { error } = await operation;
  return error
    ? { ok: false, reason: 'request_failed', message: '좋아요를 반영하지 못했어요.' }
    : { ok: true };
}

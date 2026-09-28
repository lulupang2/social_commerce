'use client';

import { uuidSchema } from '@icegear/domain';
import { z } from 'zod';
import { requestJson } from '../api/json-request';

const date = z.string().datetime({ offset: true });
export const postSchema = z.object({
  id: uuidSchema, authorId: uuidSchema, authorName: z.string(), sport: z.enum(['surf', 'tennis']),
  type: z.enum(['guide', 'review', 'meetup', 'discussion']), title: z.string(), body: z.string(),
  status: z.enum(['pending_review', 'rejected', 'active']), reason: z.string().nullable(),
  likes: z.number().int().nonnegative(), liked: z.boolean(), comments: z.number().int().nonnegative(),
  publishedAt: date.nullable(), createdAt: date, updatedAt: date,
}).strict();
export type CommunityPost = z.infer<typeof postSchema>;
const commentSchema = z.object({ id: uuidSchema, postId: uuidSchema, authorId: uuidSchema, author: z.string(), body: z.string(), createdAt: date }).strict();
export type CommunityComment = z.infer<typeof commentSchema>;
const postsSchema = z.object({ items: z.array(postSchema) }).strict();
const commentsSchema = z.object({ items: z.array(commentSchema) }).strict();
const likeSchema = z.object({ likes: z.number().int().nonnegative(), liked: z.boolean() }).strict();
type Result<T> = { ok: true; data: T } | { ok: false; message: string; status: number };

export async function communityRequest<T>(path: string, schema: z.ZodType<T>, method = 'GET', body?: unknown): Promise<Result<T>> {
  const result = await requestJson(path, schema, {
    method, body, allowNoContent: true,
    messages: {
      http: '커뮤니티 서버 요청에 실패했어요.',
      invalid: '커뮤니티 서버 응답을 확인할 수 없어요.',
      network: '커뮤니티 서버에 연결하지 못했어요.',
    },
  });
  return result.ok ? { ok: true, data: result.data } : result;
}

export const communityPath = (id: string) => `/api/v1/community/posts/${encodeURIComponent(id)}`;
export const listPosts = () => communityRequest('/api/v1/community/posts', postsSchema);
export const listMyPosts = () => communityRequest('/api/v1/me/posts', postsSchema);
export const getPost = (id: string) => communityRequest(communityPath(id), postSchema);
export const createPost = (input: { sport: 'surf' | 'tennis'; type: 'guide' | 'review' | 'meetup' | 'discussion'; title: string; body: string }) => communityRequest('/api/v1/community/posts', postSchema, 'POST', input);
export const editPost = (id: string, input: { title: string; body: string }) => communityRequest(communityPath(id), postSchema, 'PATCH', input);
export const resubmitPost = (id: string) => communityRequest(communityPath(id) + '/resubmit', postSchema, 'POST');
export const reviewPosts = () => communityRequest('/api/v1/community/reviews', postsSchema);
export const reviewPost = (id: string, decision: 'approve' | 'reject', reason = '') => communityRequest(`/api/v1/community/reviews/${encodeURIComponent(id)}/${decision}`, postSchema, 'POST', decision === 'reject' ? { reason } : undefined);
export const listComments = (id: string) => communityRequest(communityPath(id) + '/comments', commentsSchema);
export const createComment = (id: string, body: string) => communityRequest(communityPath(id) + '/comments', commentSchema, 'POST', { body });
export const changeLike = (id: string, liked: boolean) => communityRequest(communityPath(id) + '/like', likeSchema, liked ? 'PUT' : 'DELETE');

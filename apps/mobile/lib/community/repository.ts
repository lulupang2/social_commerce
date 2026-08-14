import type { CommunityPostType } from '@icegear/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '../supabase/client';
import { createDemoCommunityPosts } from './demo-fixtures';
import {
  createDemoCommunityRepository,
  isCommunityDemoEnabled,
  isCommunityDevelopmentRuntime,
} from './demo-repository';
import { createSupabaseCommunityRepository } from './repository-core';
import type {
  CommunityCommentPageOptions,
  CommunityPostPageOptions,
  CommunityRepository,
  CreateCommunityCommentInput,
  CreateCommunityPostInput,
} from './types';

export * from './optimistic';
export {
  decodeCommunityCursor,
  encodeCommunityCursor,
  MAX_COMMUNITY_PAGE_SIZE,
} from './pagination';
export type * from './types';

const TYPE_LABELS: Record<CommunityPostType, string> = {
  discussion: '이야기',
  question: '질문',
  guide: '가이드',
  review: '후기',
  event: '모임',
  announcement: '공지',
};

export interface CreateCommunityRepositoryOptions {
  /** Intended for tests and explicitly flagged development/demo builds only. */
  demoEnabled?: boolean;
}

export function communityTypeLabel(type: CommunityPostType): string {
  return TYPE_LABELS[type];
}

/**
 * A configured client always wins. Fixtures are never used as a fallback for
 * an empty response, an auth failure, or a network failure.
 */
export function createCommunityRepository(
  client: SupabaseClient | null = supabase,
  options: CreateCommunityRepositoryOptions = {},
): CommunityRepository {
  if (client) return createSupabaseCommunityRepository(client);
  const demoRequested = options.demoEnabled ?? isCommunityDemoEnabled();
  if (demoRequested && isCommunityDevelopmentRuntime()) {
    return createDemoCommunityRepository();
  }
  return createSupabaseCommunityRepository(null);
}

export const communityRepository = createCommunityRepository();

/** Canonical typed feed contract for the redesigned community routes. */
export function listCommunityPostPage(options?: CommunityPostPageOptions) {
  return communityRepository.listPosts(options);
}

/** Canonical typed detail contract; inaccessible rows are reported as not_found. */
export function getCommunityPostResult(id: string) {
  return communityRepository.getPost(id);
}

export function createCommunityPost(input: CreateCommunityPostInput) {
  return communityRepository.createPost(input);
}

export function listCommunityComments(postId: string, options?: CommunityCommentPageOptions) {
  return communityRepository.listComments(postId, options);
}

export function createCommunityComment(postId: string, input: CreateCommunityCommentInput) {
  return communityRepository.createComment(postId, input);
}

export function addCommunityPostLike(postId: string) {
  return communityRepository.addLike(postId);
}

export function removeCommunityPostLike(postId: string) {
  return communityRepository.removeLike(postId);
}

export function setCommunityPostLike(postId: string, liked: boolean) {
  return liked ? communityRepository.addLike(postId) : communityRepository.removeLike(postId);
}

/** Explicit moderator/admin boundary; ordinary sessions receive forbidden. */
export function publishCommunityPostDraft(postId: string) {
  return communityRepository.publishDraft(postId);
}

/**
 * Transitional adapters for the current route files (owned by T33). They never
 * substitute demo fixtures on a production error; T33 should consume the typed
 * result functions above to render loading/error/empty states separately.
 */
export async function listCommunityPosts() {
  const result = await communityRepository.listPosts();
  return result.data?.items ?? [];
}

export async function getCommunityPost(id: string) {
  const result = await communityRepository.getPost(id);
  return result.data ?? null;
}

/** Returns fixtures only when the explicit development demo flag is active. */
export function demoCommunityPosts() {
  return isCommunityDemoEnabled() ? createDemoCommunityPosts() : [];
}

import { createDemoCommunityComments, createDemoCommunityPosts } from './demo-fixtures';
import {
  decodeCommunityCursor,
  encodeCommunityCursor,
  normalizeCommunityPageSize,
} from './pagination';
import type {
  CommunityRepository,
  CommunityRepositoryError,
  CommunityRepositoryResult,
} from './types';

function success<T>(data: T): CommunityRepositoryResult<T> {
  return { data, error: null };
}

function failure<T>(error: CommunityRepositoryError): CommunityRepositoryResult<T> {
  return { data: null, error };
}

function authError(): CommunityRepositoryError {
  return {
    code: 'unauthenticated',
    kind: 'auth',
    message: 'Demo fixtures are read-only. Sign in to write community data.',
    retryable: false,
  };
}

function notFoundError(): CommunityRepositoryError {
  return {
    code: 'not_found',
    kind: 'not-found',
    message: 'Community post not found.',
    retryable: false,
  };
}

function cursorError(): CommunityRepositoryError {
  return {
    code: 'validation_error',
    kind: 'validation',
    message: 'The page cursor is invalid.',
    retryable: false,
    fieldErrors: { cursor: 'The page cursor is invalid.' },
  };
}

export function isCommunityDevelopmentRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

export function isCommunityDemoEnabled(): boolean {
  return isCommunityDevelopmentRuntime() && process.env.EXPO_PUBLIC_ENABLE_DEMO_AUTH === 'true';
}

export function createDemoCommunityRepository(): CommunityRepository {
  return {
    async listPosts(options = {}) {
      if (options.includeOwnDrafts) return failure(authError());
      const limit = normalizeCommunityPageSize(options.limit);
      if (!limit) return failure(cursorError());
      const cursor = decodeCommunityCursor(options.cursor);
      if (options.cursor && !cursor) return failure(cursorError());

      const posts = createDemoCommunityPosts()
        .filter((post) => !options.sport || post.sport === options.sport)
        .filter((post) => !options.type || post.type === options.type)
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
        );
      const start = cursor
        ? Math.max(
            0,
            posts.findIndex(
              (post) =>
                post.createdAt < cursor.createdAt ||
                (post.createdAt === cursor.createdAt && post.id < cursor.id),
            ),
          )
        : 0;
      const page = posts.slice(start, start + limit + 1);
      const hasMore = page.length > limit;
      const items = page.slice(0, limit);
      const last = items.at(-1);
      return success({
        items,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCommunityCursor({ createdAt: last.createdAt, id: last.id })
            : null,
      });
    },
    async getPost(id) {
      const post = createDemoCommunityPosts().find((item) => item.id === id);
      return post ? success(post) : failure(notFoundError());
    },
    async listComments(postId, options = {}) {
      if (!createDemoCommunityPosts().some((post) => post.id === postId)) {
        return failure(notFoundError());
      }
      const limit = normalizeCommunityPageSize(options.limit);
      if (!limit) return failure(cursorError());
      const cursor = decodeCommunityCursor(options.cursor);
      if (options.cursor && !cursor) return failure(cursorError());
      const all = createDemoCommunityComments()
        .filter((comment) => comment.postId === postId)
        .sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
        );
      const start = cursor
        ? Math.max(
            0,
            all.findIndex(
              (comment) =>
                comment.createdAt > cursor.createdAt ||
                (comment.createdAt === cursor.createdAt && comment.id > cursor.id),
            ),
          )
        : 0;
      const page = all.slice(start, start + limit + 1);
      const hasMore = page.length > limit;
      const items = page.slice(0, limit);
      const last = items.at(-1);
      return success({
        items,
        totalCount: all.length,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCommunityCursor({ createdAt: last.createdAt, id: last.id })
            : null,
      });
    },
    createPost: async () => failure(authError()),
    createComment: async () => failure(authError()),
    addLike: async () => failure(authError()),
    removeLike: async () => failure(authError()),
    publishDraft: async () => failure(authError()),
  };
}

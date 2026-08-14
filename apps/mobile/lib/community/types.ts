import type { CommunityPostStatus, CommunityPostType, Sport } from '@icegear/domain';

export type CommunityRepositoryErrorCode =
  | 'not_configured'
  | 'validation_error'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'network_error'
  | 'conflict'
  | 'mapping_error';

export type CommunityRepositoryErrorKind =
  | 'configuration'
  | 'validation'
  | 'auth'
  | 'permission'
  | 'not-found'
  | 'network'
  | 'conflict'
  | 'mapping';

export interface CommunityRepositoryError {
  code: CommunityRepositoryErrorCode;
  kind: CommunityRepositoryErrorKind;
  message: string;
  retryable: boolean;
  fieldErrors?: Record<string, string>;
  /** A write completed, but its authoritative follow-up read did not. */
  operationMayHaveSucceeded?: boolean;
}

export type CommunityRepositoryResult<T> =
  { data: T; error: null } | { data: null; error: CommunityRepositoryError };

export interface CommunityAuthorProjection {
  id: string;
  displayName: string;
  initial: string;
  avatarUrl?: string;
}

export interface CommunityAggregateCounts {
  commentCount: number;
  likeCount: number;
  likedByMe?: boolean;
}

export interface CommunityPostPreview {
  id: string;
  authorId: string;
  author: CommunityAuthorProjection;
  /** Compatibility aliases for the current route components. */
  authorName: string;
  authorInitial: string;
  sport?: Sport;
  type: CommunityPostType;
  status: CommunityPostStatus;
  title: string;
  body: string;
  counts: CommunityAggregateCounts;
  /** Compatibility aliases for the current route components. */
  commentCount: number;
  reactionCount: number;
  likedByMe?: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  timeLabel: string;
  isOwner: boolean;
  isDemo?: boolean;
}

export interface CommunityCommentPreview {
  id: string;
  postId: string;
  authorId: string;
  author: CommunityAuthorProjection;
  authorName: string;
  authorInitial: string;
  body: string;
  parentCommentId?: string;
  createdAt: string;
  updatedAt?: string;
  timeLabel: string;
  isMine: boolean;
  isDemo?: boolean;
}

export interface CommunityPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Present when the backing query can return an exact total cheaply. */
  totalCount?: number;
}

export interface CommunityPostPageOptions {
  cursor?: string | null;
  limit?: number;
  sport?: Sport;
  type?: CommunityPostType;
  /** Includes only the current author's drafts alongside public active posts. */
  includeOwnDrafts?: boolean;
}

export interface CommunityCommentPageOptions {
  cursor?: string | null;
  limit?: number;
}

export interface CreateCommunityPostInput {
  title: string;
  body: string;
  sport?: Sport;
  type?: CommunityPostType;
}

export interface CreateCommunityCommentInput {
  body: string;
}

export interface CommunityCommentMutation {
  comment: CommunityCommentPreview;
  commentCount: number;
}

export interface CommunityLikeState {
  postId: string;
  likeCount: number;
  /** Compatibility alias for the current route components. */
  reactionCount: number;
  likedByMe: boolean;
}

export interface CommunityRepository {
  listPosts(
    options?: CommunityPostPageOptions,
  ): Promise<CommunityRepositoryResult<CommunityPage<CommunityPostPreview>>>;
  getPost(id: string): Promise<CommunityRepositoryResult<CommunityPostPreview>>;
  createPost(
    input: CreateCommunityPostInput,
  ): Promise<CommunityRepositoryResult<CommunityPostPreview>>;
  listComments(
    postId: string,
    options?: CommunityCommentPageOptions,
  ): Promise<CommunityRepositoryResult<CommunityPage<CommunityCommentPreview>>>;
  createComment(
    postId: string,
    input: CreateCommunityCommentInput,
  ): Promise<CommunityRepositoryResult<CommunityCommentMutation>>;
  addLike(postId: string): Promise<CommunityRepositoryResult<CommunityLikeState>>;
  removeLike(postId: string): Promise<CommunityRepositoryResult<CommunityLikeState>>;
  /** Operator-only. The database trigger owns published_at and audit logging. */
  publishDraft(postId: string): Promise<CommunityRepositoryResult<CommunityPostPreview>>;
}

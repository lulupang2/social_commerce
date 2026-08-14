import type {
  CommunityCommentMutation,
  CommunityCommentPreview,
  CommunityLikeState,
  CommunityRepositoryError,
} from './types';

export interface CommunityReactionOptimisticState {
  likeCount: number;
  likedByMe: boolean;
  pending: {
    mutationId: string;
    previousLikeCount: number;
    previousLikedByMe: boolean;
  } | null;
  error: CommunityRepositoryError | null;
}

export type CommunityReactionOptimisticAction =
  | { type: 'begin'; mutationId: string; likedByMe?: boolean }
  | { type: 'commit'; mutationId: string; value: CommunityLikeState }
  | { type: 'rollback'; mutationId: string; error: CommunityRepositoryError }
  | { type: 'reset'; value: CommunityLikeState };

export function createCommunityReactionOptimisticState(value: {
  likeCount: number;
  likedByMe?: boolean;
}): CommunityReactionOptimisticState {
  return {
    likeCount: Math.max(0, value.likeCount),
    likedByMe: value.likedByMe ?? false,
    pending: null,
    error: null,
  };
}

/**
 * Only one like mutation may be pending. Repeated taps are ignored until the
 * matching commit/rollback arrives, so a stale response cannot undo newer UI.
 */
export function communityReactionOptimisticReducer(
  state: CommunityReactionOptimisticState,
  action: CommunityReactionOptimisticAction,
): CommunityReactionOptimisticState {
  switch (action.type) {
    case 'begin': {
      if (state.pending) return state;

      const likedByMe = action.likedByMe ?? !state.likedByMe;
      const delta = likedByMe === state.likedByMe ? 0 : likedByMe ? 1 : -1;
      return {
        likeCount: Math.max(0, state.likeCount + delta),
        likedByMe,
        pending: {
          mutationId: action.mutationId,
          previousLikeCount: state.likeCount,
          previousLikedByMe: state.likedByMe,
        },
        error: null,
      };
    }
    case 'commit':
      if (state.pending?.mutationId !== action.mutationId) return state;
      return {
        likeCount: Math.max(0, action.value.likeCount),
        likedByMe: action.value.likedByMe,
        pending: null,
        error: null,
      };
    case 'rollback':
      if (state.pending?.mutationId !== action.mutationId) return state;
      return {
        likeCount: state.pending.previousLikeCount,
        likedByMe: state.pending.previousLikedByMe,
        pending: null,
        error: action.error,
      };
    case 'reset':
      return createCommunityReactionOptimisticState(action.value);
  }
}

export interface OptimisticCommunityComment extends CommunityCommentPreview {
  optimistic?: boolean;
  clientMutationId?: string;
}

export interface CommunityCommentsOptimisticState {
  comments: OptimisticCommunityComment[];
  commentCount: number;
  pendingMutationIds: string[];
  error: CommunityRepositoryError | null;
}

export type CommunityCommentsOptimisticAction =
  | {
      type: 'begin';
      mutationId: string;
      comment: CommunityCommentPreview;
    }
  | {
      type: 'commit';
      mutationId: string;
      value: CommunityCommentMutation;
    }
  | {
      type: 'rollback';
      mutationId: string;
      error: CommunityRepositoryError;
    }
  | {
      type: 'reset';
      comments: CommunityCommentPreview[];
      commentCount: number;
    };

export function createCommunityCommentsOptimisticState(
  comments: CommunityCommentPreview[],
  commentCount: number,
): CommunityCommentsOptimisticState {
  return {
    comments: comments.map((comment) => ({ ...comment })),
    commentCount: Math.max(0, commentCount),
    pendingMutationIds: [],
    error: null,
  };
}

export function communityCommentsOptimisticReducer(
  state: CommunityCommentsOptimisticState,
  action: CommunityCommentsOptimisticAction,
): CommunityCommentsOptimisticState {
  switch (action.type) {
    case 'begin':
      if (state.pendingMutationIds.includes(action.mutationId)) return state;
      return {
        comments: [
          ...state.comments,
          {
            ...action.comment,
            optimistic: true,
            clientMutationId: action.mutationId,
          },
        ],
        commentCount: state.commentCount + 1,
        pendingMutationIds: [...state.pendingMutationIds, action.mutationId],
        error: null,
      };
    case 'commit': {
      if (!state.pendingMutationIds.includes(action.mutationId)) return state;
      const remainingPending = state.pendingMutationIds.filter((id) => id !== action.mutationId);
      return {
        comments: state.comments.map((comment) =>
          comment.clientMutationId === action.mutationId ? action.value.comment : comment,
        ),
        commentCount: Math.max(0, action.value.commentCount + remainingPending.length),
        pendingMutationIds: remainingPending,
        error: null,
      };
    }
    case 'rollback':
      if (!state.pendingMutationIds.includes(action.mutationId)) return state;
      return {
        comments: state.comments.filter(
          (comment) => comment.clientMutationId !== action.mutationId,
        ),
        commentCount: Math.max(0, state.commentCount - 1),
        pendingMutationIds: state.pendingMutationIds.filter((id) => id !== action.mutationId),
        error: action.error,
      };
    case 'reset':
      return createCommunityCommentsOptimisticState(action.comments, action.commentCount);
  }
}

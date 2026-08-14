import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useReducer, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  createCommunityComment,
  getCommunityPostResult,
  listCommunityComments,
  setCommunityPostLike,
  type CommunityCommentMutation,
  type CommunityCommentPreview,
  type CommunityPostPreview,
} from '../../lib/community/repository';
import {
  communityCommentsOptimisticReducer,
  communityReactionOptimisticReducer,
  createCommunityCommentsOptimisticState,
  createCommunityReactionOptimisticState,
  type CommunityCommentsOptimisticAction,
} from '../../lib/community/optimistic';
import { communityTypeLabel } from '../../lib/community/repository';
import { formatTime, sportLabels } from '../../lib/format';
import { colors, radii } from '../../lib/theme';
import { AppText as Text } from '../../lib/typography';
import { CommunityCommentSection } from '../../components/community/CommunityCommentSection';
import { ModerationBadge } from '../../components/community/ModerationBadge';
import {
  DemoModeBanner,
  ErrorView,
  LoadingView,
} from '../../components/community/CommunityStateViews';
import { moderationRepository } from '../../lib/moderation';

export default function CommunityDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const postId = Array.isArray(id) ? id[0] : id;

  const [post, setPost] = useState<CommunityPostPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Optimistic like state
  const [reactionState, dispatchReaction] = useReducer(
    communityReactionOptimisticReducer,
    createCommunityReactionOptimisticState({ likeCount: 0, likedByMe: false }),
  );

  // Optimistic comments state & pagination
  const [commentState, dispatchComments] = useReducer(
    communityCommentsOptimisticReducer,
    createCommunityCommentsOptimisticState([], 0),
  );

  const [commentCursor, setCommentCursor] = useState<string | null>(null);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const fetchPostAndComments = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);

    const postRes = await getCommunityPostResult(postId);

    if (postRes.error) {
      setError(postRes.error.message || '게시글을 불러올 수 없습니다.');
      setPost(null);
      setLoading(false);
      return;
    }

    if (postRes.data) {
      const fetchedPost = postRes.data;
      setPost(fetchedPost);

      // Initialize reaction state
      const initialLikeCount = fetchedPost.counts?.likeCount ?? fetchedPost.reactionCount ?? 0;
      const initialLiked = fetchedPost.counts?.likedByMe ?? fetchedPost.likedByMe ?? false;
      dispatchReaction({
        type: 'reset',
        value: {
          postId,
          likeCount: initialLikeCount,
          reactionCount: initialLikeCount,
          likedByMe: initialLiked,
        },
      });

      // Fetch initial comments
      const commentRes = await listCommunityComments(postId, { limit: 10 });
      if (commentRes.data) {
        dispatchComments({
          type: 'reset',
          comments: commentRes.data.items,
          commentCount: commentRes.data.totalCount ?? commentRes.data.items.length,
        });
        setHasMoreComments(commentRes.data.hasMore);
        setCommentCursor(commentRes.data.nextCursor);
      }
    }

    setLoading(false);
  }, [postId]);

  useEffect(() => {
    fetchPostAndComments();
  }, [fetchPostAndComments]);

  const loadMoreComments = async () => {
    if (!postId || !hasMoreComments || loadingMoreComments || !commentCursor) return;
    setLoadingMoreComments(true);

    const res = await listCommunityComments(postId, {
      cursor: commentCursor,
      limit: 10,
    });

    if (res.data) {
      const newItems = res.data.items;
      dispatchComments({
        type: 'reset',
        comments: [...commentState.comments, ...newItems],
        commentCount: commentState.commentCount + newItems.length,
      });
      setHasMoreComments(res.data.hasMore);
      setCommentCursor(res.data.nextCursor);
    }
    setLoadingMoreComments(false);
  };

  const handleToggleLike = async () => {
    if (!postId || !post || reactionState.pending) return;

    const newLikedState = !reactionState.likedByMe;
    const mutationId = `like-${Date.now()}`;

    // Optimistic update
    dispatchReaction({
      type: 'begin',
      mutationId,
      likedByMe: newLikedState,
    });

    const res = await setCommunityPostLike(postId, newLikedState);

    if (res.error) {
      // Rollback on failure
      dispatchReaction({
        type: 'rollback',
        mutationId,
        error: res.error,
      });
    } else if (res.data) {
      // Commit
      dispatchReaction({
        type: 'commit',
        mutationId,
        value: res.data,
      });
    }
  };

  const handleAddComment = async (body: string): Promise<boolean> => {
    if (!postId || !post) return false;
    setSubmittingComment(true);

    const tempId = `temp-comment-${Date.now()}`;
    const mutationId = `mutate-comment-${Date.now()}`;

    const tempComment: CommunityCommentPreview = {
      id: tempId,
      postId,
      authorId: 'me',
      author: { id: 'me', initial: 'ME', displayName: '나' },
      authorName: '나',
      authorInitial: 'ME',
      body,
      createdAt: new Date().toISOString(),
      timeLabel: '방금 전',
      isMine: true,
    };

    // Optimistic update
    dispatchComments({
      type: 'begin',
      mutationId,
      comment: tempComment,
    });

    const res = await createCommunityComment(postId, { body });

    if (res.error) {
      dispatchComments({
        type: 'rollback',
        mutationId,
        error: res.error,
      });
      setSubmittingComment(false);
      return false;
    }

    if (res.data) {
      dispatchComments({
        type: 'commit',
        mutationId,
        value: res.data,
      });
      setSubmittingComment(false);
      return true;
    }

    setSubmittingComment(false);
    return false;
  };

  const handleReportPost = () => {
    if (!post) return;
    Alert.alert(
      '게시글 신고',
      `"${post.title}" 게시글을 신고하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '신고 접수',
          style: 'destructive',
          onPress: async () => {
            const res = await moderationRepository.submitReport({
              targetType: 'community_post',
              targetId: post.id,
              reason: 'other',
            });
            if (res.error) {
              Alert.alert('신고 실패', res.error.message);
            } else {
              Alert.alert('신고 완료', '신고가 접수되었습니다. 검토 후 처리됩니다.');
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const handleReportComment = (comment: CommunityCommentPreview) => {
    Alert.alert(
      '댓글 신고',
      '해당 댓글을 신고하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '신고 접수',
          style: 'destructive',
          onPress: async () => {
            const res = await moderationRepository.submitReport({
              targetType: 'comment',
              targetId: comment.id,
              reason: 'other',
            });
            if (res.error) {
              Alert.alert('신고 실패', res.error.message);
            } else {
              Alert.alert('신고 완료', '신고가 접수되었습니다. 검토 후 처리됩니다.');
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LoadingView message="게시글 정보를 불러오는 중..." />
      </SafeAreaView>
    );
  }

  if (error || !post) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorView
          title="게시글을 찾을 수 없습니다"
          message={error || '존재하지 않거나 접근 권한이 없는 게시글입니다.'}
          onRetry={fetchPostAndComments}
        />
      </SafeAreaView>
    );
  }

  const isDemoActive = post.isDemo;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        {/* Navigation Bar */}
        <View style={styles.navBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로 가기"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
          <Text style={styles.navTitle} numberOfLines={1}>
            {communityTypeLabel(post.type)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="신고하기"
            onPress={handleReportPost}
            style={({ pressed }) => [styles.navReportButton, pressed && styles.pressed]}
          >
            <Text style={styles.navReportText}>신고</Text>
          </Pressable>
        </View>

        {isDemoActive && <DemoModeBanner />}

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Post Header */}
          <View style={styles.postCard}>
            <View style={styles.postHeaderRow}>
              <View style={styles.authorGroup}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {post.authorInitial || post.author?.initial || '?'}
                  </Text>
                </View>
                <View>
                  <Text style={styles.authorName}>
                    {post.authorName || post.author?.initial || '작성자'}
                  </Text>
                  <Text style={styles.timeLabel}>
                    {post.timeLabel || formatTime(post.createdAt)}
                  </Text>
                </View>
              </View>

              <View style={styles.badgesGroup}>
                {post.sport && (
                  <View style={styles.sportBadge}>
                    <Text style={styles.sportBadgeText}>{sportLabels[post.sport]}</Text>
                  </View>
                )}
                <ModerationBadge status={post.status} isDemo={post.isDemo} />
              </View>
            </View>

            <Text style={styles.title}>{post.title}</Text>
            <Text style={styles.body}>{post.body}</Text>

            {/* Like Reaction & Stats Bar */}
            <View style={styles.reactionBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  reactionState.likedByMe
                    ? `좋아요 취소, 현재 ${reactionState.likeCount}개`
                    : `좋아요 누르기, 현재 ${reactionState.likeCount}개`
                }
                onPress={handleToggleLike}
                disabled={Boolean(reactionState.pending)}
                style={({ pressed }) => [
                  styles.likeButton,
                  reactionState.likedByMe && styles.likeButtonActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.likeIcon, reactionState.likedByMe && styles.likeIconActive]}>
                  {reactionState.likedByMe ? '♥' : '♡'}
                </Text>
                <Text style={[styles.likeText, reactionState.likedByMe && styles.likeTextActive]}>
                  좋아요 {reactionState.likeCount}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Comment Section */}
          <CommunityCommentSection
            comments={commentState.comments}
            totalCount={commentState.commentCount}
            hasMore={hasMoreComments}
            loadingMore={loadingMoreComments}
            onLoadMore={loadMoreComments}
            onAddComment={handleAddComment}
            onReportComment={handleReportComment}
            isSubmitting={submittingComment}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  keyboardContainer: {
    flex: 1,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
    minWidth: 40,
  },
  backButtonText: {
    fontSize: 22,
    color: colors.ink,
    fontWeight: '600',
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    flex: 1,
    textAlign: 'center',
  },
  navReportButton: {
    padding: 4,
    minWidth: 40,
    alignItems: 'flex-end',
  },
  navReportText: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  postCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  postHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  authorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '800',
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  timeLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 1,
  },
  badgesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sportBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  sportBadgeText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    lineHeight: 24,
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 18,
  },
  reactionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: colors.canvas,
  },
  likeButtonActive: {
    borderColor: colors.danger,
    backgroundColor: '#FEF2F2',
  },
  likeIcon: {
    fontSize: 15,
    color: colors.muted,
  },
  likeIconActive: {
    color: colors.danger,
  },
  likeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  likeTextActive: {
    color: colors.danger,
  },
  pressed: {
    opacity: 0.8,
  },
});

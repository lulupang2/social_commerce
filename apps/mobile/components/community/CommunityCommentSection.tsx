import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View, Pressable } from 'react-native';

import type { CommunityCommentPreview } from '../../lib/community/types';
import { formatTime } from '../../lib/format';
import { colors, radii } from '../../lib/theme';
import { AppText as Text, AppTextInput as TextInput } from '../../lib/typography';
import { ModerationBadge } from './ModerationBadge';

interface CommunityCommentSectionProps {
  comments: CommunityCommentPreview[];
  totalCount?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onAddComment: (text: string) => Promise<boolean>;
  onReportComment?: (comment: CommunityCommentPreview) => void;
  isSubmitting?: boolean;
}

function CommentItem({
  comment,
  onReport,
}: {
  comment: CommunityCommentPreview;
  onReport?: (comment: CommunityCommentPreview) => void;
}) {
  return (
    <View
      style={styles.commentItem}
      accessibilityRole="text"
      accessibilityLabel={`댓글: ${comment.body}`}
    >
      <View style={styles.commentHeader}>
        <View style={styles.commentAuthorRow}>
          <View style={styles.commentAvatar}>
            <Text style={styles.commentAvatarText}>
              {comment.authorInitial || comment.author?.initial || '?'}
            </Text>
          </View>
          <Text style={styles.commentAuthorName}>
            {comment.authorName || comment.author?.initial || '사용자'}
          </Text>
          {comment.isMine && (
            <View style={styles.mineBadge}>
              <Text style={styles.mineBadgeText}>작성자</Text>
            </View>
          )}
          {comment.isDemo && <ModerationBadge status="active" isDemo={true} />}
        </View>
        <Text style={styles.commentTime}>{comment.timeLabel || formatTime(comment.createdAt)}</Text>
        {onReport && !comment.isMine && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="댓글 신고"
            onPress={() => onReport(comment)}
            style={styles.reportButton}
          >
            <Text style={styles.reportText}>신고</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.commentBody}>{comment.body}</Text>
    </View>
  );
}

export function CommunityCommentSection({
  comments,
  totalCount,
  hasMore,
  loadingMore,
  onLoadMore,
  onAddComment,
  onReportComment,
  isSubmitting,
}: CommunityCommentSectionProps) {
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = newComment.trim();
    if (!trimmed || isSubmitting) return;

    setError(null);
    const success = await onAddComment(trimmed);
    if (success) {
      setNewComment('');
    } else {
      setError('댓글 등록에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          댓글 {totalCount !== undefined ? `(${totalCount})` : `(${comments.length})`}
        </Text>
      </View>

      {comments.length === 0 ? (
        <View style={styles.emptyComments}>
          <Text style={styles.emptyCommentsText}>아직 댓글이 없습니다. 첫 댓글을 남겨보세요!</Text>
        </View>
      ) : (
        <View style={styles.commentList}>
          {comments.map((item) => (
            <CommentItem key={item.id} comment={item} onReport={onReportComment} />
          ))}

          {hasMore && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="댓글 더보기"
              onPress={onLoadMore}
              disabled={loadingMore}
              style={({ pressed }) => [styles.loadMoreButton, pressed && styles.pressed]}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.loadMoreText}>댓글 더보기</Text>
              )}
            </Pressable>
          )}
        </View>
      )}

      {/* Input area */}
      <View style={styles.inputContainer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="댓글을 입력하세요..."
            placeholderTextColor={colors.muted}
            value={newComment}
            onChangeText={setNewComment}
            multiline
            accessibilityLabel="댓글 입력창"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="댓글 게시"
            onPress={handleSubmit}
            disabled={!newComment.trim() || isSubmitting}
            style={({ pressed }) => [
              styles.sendButton,
              (!newComment.trim() || isSubmitting) && styles.sendButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <Text style={styles.sendButtonText}>등록</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  header: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  emptyComments: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyCommentsText: {
    fontSize: 13,
    color: colors.muted,
  },
  commentList: {
    gap: 12,
  },
  commentItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  commentAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commentAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    color: colors.surface,
    fontSize: 10,
    fontWeight: '800',
  },
  commentAuthorName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  mineBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  mineBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
  },
  commentTime: {
    fontSize: 11,
    color: colors.muted,
  },
  commentBody: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
    marginTop: 2,
  },
  loadMoreButton: {
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: colors.canvas,
    borderRadius: radii.md,
    marginTop: 8,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  inputContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.canvas,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.ink,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    backgroundColor: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
  },
  sendButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  sendButtonText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  reportButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reportText: {
    fontSize: 11,
    color: colors.muted,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.8,
  },
});

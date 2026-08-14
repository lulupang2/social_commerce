import type { CommunityPostPreview } from '../../lib/community/types';
import { communityTypeLabel } from '../../lib/community/repository';
import { formatTime, sportLabels } from '../../lib/format';
import { colors, radii } from '../../lib/theme';
import { AppText as Text } from '../../lib/typography';
import { ModerationBadge } from './ModerationBadge';
import { Pressable, StyleSheet, View } from 'react-native';

interface CommunityPostCardProps {
  post: CommunityPostPreview;
  onPress: () => void;
  onReport?: (post: CommunityPostPreview) => void;
}

function Avatar({ post }: { post: CommunityPostPreview }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{post.authorInitial || post.author.initial || '?'}</Text>
    </View>
  );
}

export function CommunityPostCard({ post, onPress, onReport }: CommunityPostCardProps) {
  const sportName = post.sport ? sportLabels[post.sport] : null;
  const typeName = communityTypeLabel(post.type);
  const commentCount = post.counts?.commentCount ?? post.commentCount ?? 0;
  const likeCount = post.counts?.likeCount ?? post.reactionCount ?? 0;
  const likedByMe = post.counts?.likedByMe ?? post.likedByMe;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`게시글: ${post.title}, 작성자: ${post.authorName || post.author.initial}, 댓글 ${commentCount}개, 좋아요 ${likeCount}개`}
      accessibilityHint="상세 내용을 보려면 누르세요"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.header}>
        <View style={styles.authorRow}>
          <Avatar post={post} />
          <View style={styles.authorMeta}>
            <Text style={styles.authorName}>{post.authorName || post.author.initial}</Text>
            <Text style={styles.timeLabel}>{post.timeLabel || formatTime(post.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.tagRow}>
          {sportName && (
            <View style={styles.sportBadge}>
              <Text style={styles.sportBadgeText}>{sportName}</Text>
            </View>
          )}
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{typeName}</Text>
          </View>
        </View>
      </View>

      <ModerationBadge status={post.status} isDemo={post.isDemo} />

      <Text style={styles.title} numberOfLines={2}>
        {post.title}
      </Text>

      <Text style={styles.body} numberOfLines={3}>
        {post.body}
      </Text>

      <View style={styles.footer}>
        <View style={styles.statsRow}>
          <View style={styles.statItem} accessibilityLabel={`좋아요 ${likeCount}개`}>
            <Text style={[styles.statIcon, likedByMe && styles.statIconLiked]}>
              {likedByMe ? '♥' : '♡'}
            </Text>
            <Text style={[styles.statText, likedByMe && styles.statTextLiked]}>{likeCount}</Text>
          </View>
          <View style={styles.statItem} accessibilityLabel={`댓글 ${commentCount}개`}>
            <Text style={styles.statIcon}>💬</Text>
            <Text style={styles.statText}>{commentCount}</Text>
          </View>
        </View>

        {onReport && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="신고하기"
            accessibilityHint="이 게시글을 신고합니다"
            onPress={(e) => {
              e.stopPropagation();
              onReport(post);
            }}
            style={({ pressed }) => [styles.reportButton, pressed && styles.cardPressed]}
          >
            <Text style={styles.reportText}>신고</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.9,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '800',
  },
  authorMeta: {
    justifyContent: 'center',
  },
  authorName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  timeLabel: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 1,
  },
  tagRow: {
    flexDirection: 'row',
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
  typeBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  typeBadgeText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 6,
    marginBottom: 6,
  },
  body: {
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    fontSize: 14,
    color: colors.muted,
  },
  statIconLiked: {
    color: colors.danger,
  },
  statText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  statTextLiked: {
    color: colors.danger,
  },
  reportButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reportText: {
    fontSize: 12,
    color: colors.muted,
    textDecorationLine: 'underline',
  },
});

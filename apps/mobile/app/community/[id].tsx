import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  communityTypeLabel,
  getCommunityPost,
  type CommunityPostPreview,
} from '../../lib/community/repository';
import { colors, formatTime, radii, sportLabels } from '../../lib/theme';
import { AppText as Text, AppTextInput as TextInput, fontFamilies } from '../../lib/typography';

export default function CommunityDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const postId = Array.isArray(id) ? id[0] : id;
  const [post, setPost] = useState<CommunityPostPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [reactionCount, setReactionCount] = useState(0);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!postId) {
        setLoading(false);
        return;
      }
      const result = await getCommunityPost(postId);
      if (!mounted) return;
      setPost(result);
      setReactionCount(result?.reactionCount ?? 0);
      setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [postId]);

  function toggleLike() {
    setLiked((current) => {
      setReactionCount((count) => count + (current ? -1 : 1));
      return !current;
    });
  }

  function addComment() {
    const value = comment.trim();
    if (!value) return;
    setComments((current) => [...current, value]);
    setComment('');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.state}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.stateText}>글을 불러오는 중이에요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.state}>
          <Text style={styles.stateEmoji}>💬</Text>
          <Text style={styles.stateTitle}>글을 찾을 수 없어요</Text>
          <Pressable onPress={() => router.back()} style={styles.darkButton}>
            <Text style={styles.darkButtonText}>돌아가기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        style={styles.keyboard}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.navBar}>
            <Pressable
              accessibilityLabel="뒤로"
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>
            <Text style={styles.navTitle}>커뮤니티</Text>
            <Pressable accessibilityLabel="더보기" style={styles.moreButton}>
              <Text style={styles.more}>•••</Text>
            </Pressable>
          </View>

          <View style={styles.authorRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{post.authorInitial}</Text>
            </View>
            <View style={styles.authorCopy}>
              <Text style={styles.authorName}>{post.authorName}</Text>
              <Text style={styles.time}>{post.timeLabel || formatTime(post.createdAt)}</Text>
            </View>
          </View>

          <View style={styles.tagRow}>
            {post.sport ? (
              <View style={styles.sportTag}>
                <Text style={styles.sportTagText}>{sportLabels[post.sport]}</Text>
              </View>
            ) : null}
            <View style={styles.typeTag}>
              <Text style={styles.typeTagText}>{communityTypeLabel(post.type)}</Text>
            </View>
          </View>
          <Text style={styles.title}>{post.title}</Text>
          <Text style={styles.body}>{post.body}</Text>

          <View style={styles.actionRow}>
            <Pressable
              onPress={toggleLike}
              style={[styles.reactionButton, liked ? styles.reactionButtonActive : null]}
            >
              <Text style={[styles.reactionText, liked ? styles.reactionTextActive : null]}>
                {liked ? '♥' : '♡'} 좋아요 {reactionCount}
              </Text>
            </Pressable>
            <Text style={styles.commentCount}>댓글 {post.commentCount + comments.length}</Text>
          </View>

          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>댓글 {post.commentCount + comments.length}</Text>
          {comments.length ? (
            <View style={styles.commentList}>
              {comments.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.commentRow}>
                  <View style={styles.smallAvatar}>
                    <Text style={styles.smallAvatarText}>나</Text>
                  </View>
                  <View style={styles.commentBubble}>
                    <Text style={styles.commentAuthor}>나</Text>
                    <Text style={styles.commentText}>{item}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyComment}>첫 댓글을 남겨보세요.</Text>
          )}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="댓글 입력"
            onChangeText={setComment}
            onSubmitEditing={addComment}
            placeholder="따뜻한 댓글을 남겨주세요"
            placeholderTextColor={colors.subtle}
            returnKeyType="send"
            style={styles.composerInput}
            value={comment}
          />
          <Pressable
            accessibilityLabel="댓글 등록"
            disabled={!comment.trim()}
            onPress={addComment}
            style={styles.sendButton}
          >
            <Text style={[styles.sendText, !comment.trim() ? styles.sendTextDisabled : null]}>
              ↑
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  keyboard: { flex: 1 },
  content: { paddingBottom: 28, paddingHorizontal: 20 },
  navBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54,
  },
  backButton: { alignItems: 'flex-start', justifyContent: 'center', width: 42 },
  backIcon: { color: colors.ink, fontSize: 34, fontWeight: '300', lineHeight: 38 },
  navTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  moreButton: { alignItems: 'flex-end', justifyContent: 'center', width: 42 },
  more: { color: colors.muted, fontSize: 15, letterSpacing: 2 },
  authorRow: { alignItems: 'center', flexDirection: 'row', marginTop: 12 },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.navySoft,
    borderRadius: radii.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  avatarText: { color: colors.navy, fontSize: 17, fontWeight: '800' },
  authorCopy: { marginLeft: 11 },
  authorName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  time: { color: colors.subtle, fontSize: 11, marginTop: 4 },
  tagRow: { flexDirection: 'row', gap: 6, marginTop: 20 },
  sportTag: {
    backgroundColor: colors.navySoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sportTagText: { color: colors.navy, fontSize: 11, fontWeight: '800' },
  typeTag: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  typeTagText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.displayBold,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 32,
    marginTop: 15,
  },
  body: { color: colors.muted, fontSize: 15, lineHeight: 24, marginTop: 14 },
  actionRow: { alignItems: 'center', flexDirection: 'row', marginTop: 25 },
  reactionButton: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  reactionButtonActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  reactionText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  reactionTextActive: { color: colors.accent },
  commentCount: { color: colors.subtle, fontSize: 12, marginLeft: 13 },
  divider: { backgroundColor: colors.line, height: 1, marginTop: 27 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', marginTop: 20 },
  commentList: { gap: 14, marginTop: 16 },
  commentRow: { alignItems: 'flex-start', flexDirection: 'row' },
  smallAvatar: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  smallAvatarText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  commentBubble: { flex: 1, marginLeft: 9 },
  commentAuthor: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  commentText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  emptyComment: { color: colors.subtle, fontSize: 13, marginTop: 13 },
  composer: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  composerInput: {
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    minHeight: 42,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 38,
    justifyContent: 'center',
    marginLeft: 8,
    width: 38,
  },
  sendText: { color: colors.surface, fontSize: 20, fontWeight: '800' },
  sendTextDisabled: { opacity: 0.45 },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  stateEmoji: { fontSize: 38, marginBottom: 12 },
  stateTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  stateText: { color: colors.muted, fontSize: 13, marginTop: 10 },
  darkButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  darkButtonText: { color: colors.surface, fontSize: 13, fontWeight: '800' },
});

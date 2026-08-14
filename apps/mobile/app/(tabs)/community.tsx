import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';

import type { Sport } from '@icegear/domain';

import {
  communityTypeLabel,
  listCommunityPosts,
  type CommunityPostPreview,
} from '../../lib/community/repository';
import { formatTime, sportLabels } from '../../lib/format';
import { colors, radii } from '../../lib/theme';
import { AppText as Text, fontFamilies } from '../../lib/typography';

type SportFilter = 'all' | Sport;

const filters: Array<{ id: SportFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'ski', label: sportLabels.ski },
  { id: 'hockey', label: sportLabels.hockey },
];

function Avatar({ post }: { post: CommunityPostPreview }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{post.authorInitial}</Text>
    </View>
  );
}

function PostCard({ post, onPress }: { post: CommunityPostPreview; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
      <View style={styles.cardHeader}>
        <Avatar post={post} />
        <View style={styles.authorCopy}>
          <Text style={styles.authorName}>{post.authorName}</Text>
          <Text style={styles.time}>{post.timeLabel || formatTime(post.createdAt)}</Text>
        </View>
        <Text style={styles.more}>•••</Text>
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
      <Text numberOfLines={2} style={styles.cardTitle}>
        {post.title}
      </Text>
      <Text numberOfLines={3} style={styles.cardBody}>
        {post.body}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.footerItem}>♡ {post.reactionCount}</Text>
        <Text style={styles.footerItem}>▢ {post.commentCount}</Text>
        <Text style={styles.readMore}>자세히 보기 ›</Text>
      </View>
    </Pressable>
  );
}

export default function CommunityScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<CommunityPostPreview[]>([]);
  const [sportFilter, setSportFilter] = useState<SportFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPosts = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setPosts(await listCommunityPosts());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const visiblePosts = useMemo(
    () => posts.filter((post) => sportFilter === 'all' || post.sport === sportFilter),
    [posts, sportFilter],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.content}
        data={visiblePosts}
        keyExtractor={(post) => post.id}
        refreshControl={
          <RefreshControl
            colors={[colors.accent]}
            onRefresh={() => void loadPosts(true)}
            refreshing={refreshing}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.emptyText}>커뮤니티 글을 불러오는 중이에요.</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={styles.emptyTitle}>아직 글이 없어요</Text>
              <Text style={styles.emptyText}>첫 번째 이야기의 주인공이 되어보세요.</Text>
            </View>
          )
        }
        ListHeaderComponent={
          <View>
            <View style={styles.topBar}>
              <View>
                <Text style={styles.eyebrow}>ICEGEAR COMMUNITY</Text>
                <Text style={styles.title}>우리 동네 겨울 스포츠 이야기</Text>
              </View>
              <Pressable
                accessibilityLabel="커뮤니티 글쓰기"
                accessibilityRole="button"
                onPress={() => router.push('/community/create')}
                style={styles.writeButton}
              >
                <Text style={styles.writeButtonText}>＋</Text>
              </Pressable>
            </View>
            <Text style={styles.subtitle}>장비부터 스팟, 같이 타는 사람까지 편하게 나눠요.</Text>
            <View style={styles.filterRow}>
              {filters.map((filter) => {
                const active = sportFilter === filter.id;
                return (
                  <Pressable
                    key={filter.id}
                    onPress={() => setSportFilter(filter.id)}
                    style={[styles.filter, active ? styles.filterActive : null]}
                  >
                    <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.notice}>
              <Text style={styles.noticeIcon}>✦</Text>
              <Text style={styles.noticeText}>
                서로의 장비와 경험을 존중하는 따뜻한 커뮤니티를 만들어요.
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <PostCard post={item} onPress={() => router.push(`/community/${item.id}`)} />
        )}
        showsVerticalScrollIndicator={false}
      />
      <Pressable
        accessibilityLabel="새 커뮤니티 글 작성"
        accessibilityRole="button"
        onPress={() => router.push('/community/create')}
        style={styles.fab}
      >
        <Text style={styles.fabText}>＋ 글쓰기</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: { paddingBottom: 110, paddingHorizontal: 18 },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 14,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.displayBold,
    fontSize: 21,
    fontWeight: '800',
    marginTop: 6,
  },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  writeButton: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  writeButtonText: { color: colors.surface, fontSize: 26, fontWeight: '300', lineHeight: 28 },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  filter: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 17,
    paddingVertical: 9,
  },
  filterActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: colors.surface },
  notice: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    padding: 12,
  },
  noticeIcon: { color: colors.accent, fontSize: 17, fontWeight: '800' },
  noticeText: { color: colors.ink, flex: 1, fontSize: 12, lineHeight: 17 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    marginTop: 13,
    padding: 16,
  },
  cardHeader: { alignItems: 'center', flexDirection: 'row' },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.navySoft,
    borderRadius: radii.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  avatarText: { color: colors.navy, fontSize: 15, fontWeight: '800' },
  authorCopy: { flex: 1, marginLeft: 10 },
  authorName: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  time: { color: colors.subtle, fontSize: 11, marginTop: 3 },
  more: { color: colors.subtle, fontSize: 15, letterSpacing: 2 },
  tagRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  sportTag: {
    backgroundColor: colors.navySoft,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  sportTagText: { color: colors.navy, fontSize: 10, fontWeight: '800' },
  typeTag: {
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  typeTagText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', lineHeight: 24, marginTop: 11 },
  cardBody: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 7 },
  cardFooter: { alignItems: 'center', flexDirection: 'row', marginTop: 15 },
  footerItem: { color: colors.subtle, fontSize: 12, marginRight: 14 },
  readMore: { color: colors.accent, flex: 1, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  emptyState: {
    alignItems: 'center',
    minHeight: 300,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyEmoji: { fontSize: 38, marginBottom: 10 },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 13, marginTop: 7, textAlign: 'center' },
  fab: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    bottom: 24,
    elevation: 4,
    paddingHorizontal: 18,
    paddingVertical: 13,
    position: 'absolute',
    right: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  fabText: { color: colors.surface, fontSize: 13, fontWeight: '800' },
});

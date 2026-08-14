import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';

import {
  demoCommunityPosts,
  listCommunityPostPage,
  type CommunityPostPreview,
} from '../../lib/community/repository';
import { colors, radii } from '../../lib/theme';
import { AppText as Text } from '../../lib/typography';
import {
  CommunityFilterBar,
  type PostTypeFilterOption,
  type SportFilterOption,
} from '../../components/community/CommunityFilterBar';
import { CommunityPostCard } from '../../components/community/CommunityPostCard';
import {
  DemoModeBanner,
  EmptyView,
  ErrorView,
  LoadingView,
} from '../../components/community/CommunityStateViews';

export default function CommunityScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<CommunityPostPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedSport, setSelectedSport] = useState<SportFilterOption>('all');
  const [selectedType, setSelectedType] = useState<PostTypeFilterOption>('all');

  const demoActive = demoCommunityPosts().length > 0 || posts.some((p) => p.isDemo);

  const fetchPosts = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const sportParam = selectedSport === 'all' ? undefined : selectedSport;
      const typeParam = selectedType === 'all' ? undefined : selectedType;

      const result = await listCommunityPostPage({
        sport: sportParam,
        type: typeParam,
        limit: 10,
        includeOwnDrafts: true,
      });

      if (result.error) {
        // Production failures MUST NOT fallback to demo content!
        setError(result.error.message || '게시글 목록을 불러오지 못했습니다.');
        setPosts([]);
        setHasMore(false);
        setNextCursor(null);
      } else if (result.data) {
        setPosts(result.data.items);
        setHasMore(result.data.hasMore);
        setNextCursor(result.data.nextCursor);
      }

      setLoading(false);
      setRefreshing(false);
    },
    [selectedSport, selectedType],
  );

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const loadMorePosts = async () => {
    if (!hasMore || loadingMore || !nextCursor) return;
    setLoadingMore(true);

    const sportParam = selectedSport === 'all' ? undefined : selectedSport;
    const typeParam = selectedType === 'all' ? undefined : selectedType;

    const result = await listCommunityPostPage({
      cursor: nextCursor,
      sport: sportParam,
      type: typeParam,
      limit: 10,
      includeOwnDrafts: true,
    });

    if (result.data) {
      setPosts((prev) => [...prev, ...result.data.items]);
      setHasMore(result.data.hasMore);
      setNextCursor(result.data.nextCursor);
    }
    setLoadingMore(false);
  };

  const handleReportPost = (post: CommunityPostPreview) => {
    // T50 Entry Hook: Report handling
    Alert.alert(
      '게시글 신고',
      `"${post.title}" 게시글을 신고하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '신고 접수',
          style: 'destructive',
          onPress: () => {
            Alert.alert('신고 완료', '신고가 접수되었습니다. 검토 후 처리됩니다.');
          },
        },
      ],
      { cancelable: true },
    );
  };

  const renderContent = () => {
    if (loading && !refreshing) {
      return <LoadingView />;
    }

    if (error) {
      return (
        <ErrorView title="목록을 불러올 수 없습니다" message={error} onRetry={() => fetchPosts()} />
      );
    }

    if (posts.length === 0) {
      return (
        <EmptyView
          title="게시글이 없습니다"
          message="첫 번째 글을 작성해보세요!"
          actionLabel="글쓰기"
          onAction={() => router.push('/community/create')}
        />
      );
    }

    return (
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CommunityPostCard
            post={item}
            onPress={() => router.push(`/community/${item.id}`)}
            onReport={handleReportPost}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchPosts(true)}
            tintColor={colors.accent}
          />
        }
        onEndReached={loadMorePosts}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMore}>
              <LoadingView message="더 많은 글을 불러오는 중..." />
            </View>
          ) : null
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>커뮤니티</Text>
          <Text style={styles.headerSubtitle}>스키 & 하키 장비 이야기와 정보 공유</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="글쓰기"
          accessibilityHint="새 커뮤니티 글을 작성합니다"
          onPress={() => router.push('/community/create')}
          style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
        >
          <Text style={styles.createButtonText}>+ 글쓰기</Text>
        </Pressable>
      </View>

      {demoActive && <DemoModeBanner />}

      <CommunityFilterBar
        selectedSport={selectedSport}
        onSelectSport={setSelectedSport}
        selectedType={selectedType}
        onSelectType={setSelectedType}
      />

      <View style={styles.contentContainer}>{renderContent()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  createButton: {
    backgroundColor: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  createButtonText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  contentContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  loadingMore: {
    paddingVertical: 16,
  },
  pressed: {
    opacity: 0.8,
  },
});

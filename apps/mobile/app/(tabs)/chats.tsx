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

import { useSession } from '../../lib/auth/session';
import { createDemoChatTransport } from '../../lib/chat/demo-transport';
import { chatRepository, type ChatSummary } from '../../lib/chat/repository';
import { colors, radii } from '../../lib/theme';
import { AppText as Text, fontFamilies } from '../../lib/typography';

const isDevelopmentRuntime = typeof __DEV__ !== 'undefined' && __DEV__ === true;

function ConnectionPill({ unreadTotal, isDemo }: { unreadTotal: number; isDemo: boolean }) {
  return (
    <View style={styles.statusPill}>
      <View style={[styles.statusDot, isDemo ? styles.statusDotDemo : styles.statusDotLive]} />
      <Text style={styles.statusText}>{isDemo ? '개발 테스트 데모' : '실시간 연결됨'}</Text>
      {unreadTotal > 0 ? (
        <View style={styles.totalBadge}>
          <Text style={styles.totalBadgeText}>{unreadTotal > 99 ? '99+' : unreadTotal}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ChatRow({ chat, onPress }: { chat: ChatSummary; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{chat.participantInitial}</Text>
      </View>
      <View style={styles.copy}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{chat.participantName}</Text>
          <Text style={styles.time}>{chat.timeLabel}</Text>
        </View>
        <Text style={styles.listing} numberOfLines={1}>
          {chat.listingTitle}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {chat.preview}
        </Text>
      </View>
      {chat.unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{chat.unreadCount > 99 ? '99+' : chat.unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function ChatsScreen() {
  const router = useRouter();
  const session = useSession();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  const isAuthenticated = session.state.status === 'authenticated';

  const loadChats = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      if (!isAuthenticated && (!isDevelopmentRuntime || !demoMode)) {
        setChats([]);
        setUnreadTotal(0);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!isAuthenticated && isDevelopmentRuntime && demoMode) {
        const demoTransport = createDemoChatTransport();
        const convs = await demoTransport.listConversations();
        const unread = await demoTransport.getUnreadSummary();
        setChats(convs.data?.items ?? []);
        setUnreadTotal(unread.data?.total ?? 0);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const [convs, unread] = await Promise.all([
        chatRepository.listConversations(),
        chatRepository.getUnreadSummary(),
      ]);

      if (convs.error) {
        setError(convs.error.message);
        setChats([]);
      } else {
        setChats(convs.data.items);
      }

      if (!unread.error && unread.data) {
        setUnreadTotal(unread.data.total);
      } else if (convs.data) {
        const total = convs.data.items.reduce((sum, item) => sum + item.unreadCount, 0);
        setUnreadTotal(total);
      }

      setLoading(false);
      setRefreshing(false);
    },
    [isAuthenticated, demoMode],
  );

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  const activeUnreadTotal = useMemo(() => {
    if (!isAuthenticated && !demoMode) return 0;
    return unreadTotal;
  }, [isAuthenticated, demoMode, unreadTotal]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.content}
        data={chats}
        keyExtractor={(chat) => chat.id}
        refreshControl={
          <RefreshControl
            colors={[colors.accent]}
            onRefresh={() => void loadChats(true)}
            refreshing={refreshing}
          />
        }
        ListEmptyComponent={
          !isAuthenticated && (!isDevelopmentRuntime || !demoMode) ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔒</Text>
              <Text style={styles.emptyTitle}>로그인이 필요해요</Text>
              <Text style={styles.emptyText}>
                대화 목록을 확인하려면 IceGear 계정에 로그인해 주세요.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/auth')}
                style={styles.actionButton}
              >
                <Text style={styles.actionButtonText}>로그인하기</Text>
              </Pressable>
              {isDevelopmentRuntime ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDemoMode(true)}
                  style={styles.demoToggle}
                >
                  <Text style={styles.demoToggleText}>[개발 전용] 데모 대화 보기</Text>
                </Pressable>
              ) : null}
            </View>
          ) : loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.emptyText}>채팅을 불러오는 중이에요.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={styles.emptyTitle}>아직 대화가 없어요</Text>
              <Text style={styles.emptyText}>
                관심 있는 상품의 판매자에게 먼저 인사를 건네보세요.
              </Text>
              {!isAuthenticated && demoMode ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDemoMode(false)}
                  style={styles.demoToggle}
                >
                  <Text style={styles.demoToggleText}>데모 끄고 로그인 안내로 돌아가기</Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <Text style={styles.eyebrow}>ICEGEAR MESSAGE</Text>
              {isAuthenticated || demoMode ? (
                <ConnectionPill
                  isDemo={!isAuthenticated && demoMode}
                  unreadTotal={activeUnreadTotal}
                />
              ) : null}
            </View>
            <Text style={styles.title}>채팅</Text>
            <Text style={styles.subtitle}>안전한 거래를 위해 IceGear 안에서 대화해요.</Text>
            {error ? <Text style={styles.headerError}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <ChatRow
            chat={item}
            onPress={() =>
              router.push(
                !isAuthenticated && demoMode ? `/chat/${item.id}?demo=true` : `/chat/${item.id}`,
              )
            }
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: { paddingBottom: 30, paddingHorizontal: 18 },
  header: { paddingTop: 14, paddingBottom: 18 },
  headerTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  statusPill: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusDot: {
    borderRadius: radii.pill,
    height: 7,
    width: 7,
  },
  statusDotLive: { backgroundColor: colors.accent },
  statusDotDemo: { backgroundColor: colors.warning },
  statusText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  totalBadge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 16,
    justifyContent: 'center',
    minWidth: 16,
    paddingHorizontal: 4,
  },
  totalBadgeText: { color: colors.surface, fontSize: 10, fontWeight: '800' },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.displayExtraBold,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 6,
  },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 7 },
  headerError: { color: colors.danger, fontSize: 12, marginTop: 8 },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    flexDirection: 'row',
    marginBottom: 10,
    padding: 14,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarText: { color: colors.accent, fontSize: 17, fontWeight: '800' },
  copy: { flex: 1, marginLeft: 12, minWidth: 0 },
  nameRow: { alignItems: 'center', flexDirection: 'row' },
  name: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: '800' },
  time: { color: colors.subtle, fontSize: 11 },
  listing: { color: colors.navy, fontSize: 11, fontWeight: '700', marginTop: 5 },
  preview: { color: colors.muted, fontSize: 12, marginTop: 5 },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 21,
    justifyContent: 'center',
    marginLeft: 9,
    minWidth: 21,
    paddingHorizontal: 6,
  },
  badgeText: { color: colors.surface, fontSize: 11, fontWeight: '800' },
  empty: { alignItems: 'center', minHeight: 300, justifyContent: 'center', paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 38, marginBottom: 11 },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'center',
  },
  actionButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  actionButtonText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
  demoToggle: {
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  demoToggleText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});

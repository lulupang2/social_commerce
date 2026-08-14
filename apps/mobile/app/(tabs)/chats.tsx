import { useCallback, useEffect, useState } from 'react';
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

import { listChats, type ChatSummary } from '../../lib/chat/repository';
import { colors, radii } from '../../lib/theme';
import { AppText as Text, fontFamilies } from '../../lib/typography';

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
      {chat.unreadCount ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{chat.unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function ChatsScreen() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadChats = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setChats(await listChats());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

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
          loading ? (
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
            </View>
          )
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>ICEGEAR MESSAGE</Text>
            <Text style={styles.title}>채팅</Text>
            <Text style={styles.subtitle}>안전한 거래를 위해 IceGear 안에서 대화해요.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <ChatRow chat={item} onPress={() => router.push(`/chat/${item.id}`)} />
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
  eyebrow: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.displayExtraBold,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 6,
  },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 7 },
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
});

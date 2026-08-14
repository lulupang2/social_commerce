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
  getChat,
  sendChatMessage,
  type ChatMessage,
  type ChatSummary,
} from '../../lib/chat/repository';
import { colors, radii } from '../../lib/theme';
import { AppText as Text, AppTextInput as TextInput } from '../../lib/typography';

export default function ChatDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const chatId = Array.isArray(id) ? id[0] : id;
  const [chat, setChat] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!chatId) {
        setLoading(false);
        return;
      }
      const result = await getChat(chatId);
      if (!mounted) return;
      setChat(result);
      setMessages(result?.messages ?? []);
      setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [chatId]);

  async function submit() {
    const body = message.trim();
    if (!body || !chatId || sending) return;
    setError(null);
    setSending(true);
    if (chat?.isDemo) {
      const now = new Date().toISOString();
      setMessages((current) => [
        ...current,
        {
          id: `local-${Date.now()}`,
          senderId: 'me',
          body,
          createdAt: now,
          timeLabel: '방금 전',
          isMine: true,
        },
      ]);
      setMessage('');
      setSending(false);
      return;
    }
    const result = await sendChatMessage(chatId, body);
    setSending(false);
    if (result.error || !result.data) {
      setError(result.error ?? '메시지를 보내지 못했어요.');
      return;
    }
    setMessages((current) => [...current, result.data as ChatMessage]);
    setMessage('');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.state}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.stateText}>채팅을 불러오는 중이에요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!chat) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.state}>
          <Text style={styles.stateEmoji}>💬</Text>
          <Text style={styles.stateTitle}>대화를 찾을 수 없어요</Text>
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
        style={styles.keyboard}
      >
        <View style={styles.navBar}>
          <Pressable
            accessibilityLabel="뒤로"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={styles.navCopy}>
            <Text style={styles.navName}>{chat.participantName}</Text>
            <Text style={styles.navListing} numberOfLines={1}>
              {chat.listingTitle}
            </Text>
          </View>
          <Pressable accessibilityLabel="더보기" style={styles.moreButton}>
            <Text style={styles.more}>•••</Text>
          </Pressable>
        </View>
        <View style={styles.safetyNotice}>
          <Text style={styles.safetyIcon}>✓</Text>
          <Text style={styles.safetyText}>거래 전 상품 상태와 만날 장소를 꼭 확인하세요.</Text>
        </View>
        <ScrollView contentContainerStyle={styles.messageList} keyboardShouldPersistTaps="handled">
          {messages.map((item) => (
            <View
              key={item.id}
              style={[styles.messageRow, item.isMine ? styles.messageRowMine : null]}
            >
              {!item.isMine ? (
                <View style={styles.smallAvatar}>
                  <Text style={styles.smallAvatarText}>{chat.participantInitial}</Text>
                </View>
              ) : null}
              <View style={[styles.bubbleWrap, item.isMine ? styles.bubbleWrapMine : null]}>
                <View style={[styles.bubble, item.isMine ? styles.bubbleMine : null]}>
                  <Text style={[styles.bubbleText, item.isMine ? styles.bubbleTextMine : null]}>
                    {item.body}
                  </Text>
                </View>
                <Text style={[styles.messageTime, item.isMine ? styles.messageTimeMine : null]}>
                  {item.timeLabel}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="메시지 입력"
            onChangeText={setMessage}
            onSubmitEditing={() => void submit()}
            placeholder="메시지를 입력하세요"
            placeholderTextColor={colors.subtle}
            returnKeyType="send"
            style={styles.input}
            value={message}
          />
          <Pressable
            accessibilityLabel="메시지 보내기"
            disabled={!message.trim() || sending}
            onPress={() => void submit()}
            style={styles.sendButton}
          >
            <Text style={[styles.sendText, !message.trim() ? styles.sendDisabled : null]}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  keyboard: { flex: 1 },
  navBar: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 62,
    paddingHorizontal: 16,
  },
  backButton: { justifyContent: 'center', width: 35 },
  backIcon: { color: colors.ink, fontSize: 34, fontWeight: '300', lineHeight: 38 },
  navCopy: { flex: 1, marginLeft: 5 },
  navName: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  navListing: { color: colors.muted, fontSize: 11, marginTop: 3 },
  moreButton: { alignItems: 'flex-end', justifyContent: 'center', width: 35 },
  more: { color: colors.muted, fontSize: 15, letterSpacing: 2 },
  safetyNotice: {
    alignItems: 'center',
    backgroundColor: colors.navySoft,
    flexDirection: 'row',
    gap: 7,
    margin: 14,
    padding: 10,
  },
  safetyIcon: {
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.pill,
    color: colors.surface,
    fontSize: 10,
    fontWeight: '800',
    height: 18,
    lineHeight: 18,
    textAlign: 'center',
    width: 18,
  },
  safetyText: { color: colors.navy, flex: 1, fontSize: 11 },
  messageList: { gap: 16, padding: 18, paddingBottom: 28 },
  messageRow: { alignItems: 'flex-end', flexDirection: 'row' },
  messageRowMine: { justifyContent: 'flex-end' },
  smallAvatar: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    height: 29,
    justifyContent: 'center',
    width: 29,
  },
  smallAvatarText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  bubbleWrap: { marginLeft: 8, maxWidth: '78%' },
  bubbleWrapMine: { alignItems: 'flex-end', marginLeft: 0 },
  bubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  bubbleMine: {
    backgroundColor: colors.accent,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  bubbleText: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  bubbleTextMine: { color: colors.surface },
  messageTime: { color: colors.subtle, fontSize: 10, marginTop: 4 },
  messageTimeMine: { textAlign: 'right' },
  composer: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    padding: 10,
  },
  input: {
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
  sendDisabled: { opacity: 0.45 },
  error: { color: colors.danger, fontSize: 11, paddingHorizontal: 14, paddingBottom: 4 },
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

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';

import { ChatBubble, ChatComposer, ConnectionStatusHeader } from '../../components/chat';
import { useSession } from '../../lib/auth/session';
import { createDemoChatTransport } from '../../lib/chat/demo-transport';
import {
  chatRepository,
  type ChatMessage,
  type ChatRealtimeStatus,
  type ChatSubscription,
  type ChatSummary,
  type MessageCursor,
} from '../../lib/chat/repository';
import { colors, radii } from '../../lib/theme';
import { AppText as Text } from '../../lib/typography';

import { moderationRepository } from '../../lib/moderation';
const isDevelopmentRuntime = typeof __DEV__ !== 'undefined' && __DEV__ === true;

export default function ChatDetailScreen() {
  const router = useRouter();
  const session = useSession();
  const { id, demo } = useLocalSearchParams<{ id: string | string[]; demo?: string }>();
  const chatId = Array.isArray(id) ? id[0] : id;
  const isDemoQuery = demo === 'true';

  const isAuthenticated = session.state.status === 'authenticated';
  const isDemo = isDevelopmentRuntime && (!isAuthenticated || isDemoQuery);

  const [chat, setChat] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ChatRealtimeStatus | 'demo'>(
    isDemo ? 'demo' : 'closed',
  );
  const [isCatchingUp, setIsCatchingUp] = useState(false);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const subscriptionRef = useRef<ChatSubscription | null>(null);
  const activeSendsRef = useRef<Set<string>>(new Set());

  const loadChatAndMessages = useCallback(async () => {
    if (!chatId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    if (isDemo) {
      const demoTransport = createDemoChatTransport();
      const conversation = await demoTransport.getConversation(chatId);
      if (conversation.error) {
        setError(conversation.error.message);
        setLoading(false);
        return;
      }
      const msgs = await demoTransport.listMessages(chatId, { pageSize: 50 });
      setChat(conversation.data);
      setMessages(msgs.data?.items ?? []);
      setConnectionStatus('demo');
      setLoading(false);
      return;
    }

    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    const conversation = await chatRepository.getConversation(chatId);
    if (conversation.error) {
      setError(conversation.error.message);
      setLoading(false);
      return;
    }

    const msgs = await chatRepository.listMessages(chatId, { pageSize: 50 });
    setChat(conversation.data);
    setMessages(msgs.data?.items ?? []);

    void chatRepository.markConversationRead(chatId);
    setLoading(false);
  }, [chatId, isDemo, isAuthenticated]);

  useEffect(() => {
    void loadChatAndMessages();
  }, [loadChatAndMessages]);

  const setupSubscription = useCallback(async () => {
    if (isDemo || !isAuthenticated || !chatId) return;

    if (subscriptionRef.current) {
      await subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }

    const lastMsg = messages[messages.length - 1];
    const afterCursor: MessageCursor | undefined = lastMsg
      ? { createdAt: lastMsg.createdAt, id: lastMsg.id }
      : undefined;

    const subResult = await chatRepository.subscribeToMessages(chatId, afterCursor, {
      onStatus: (status) => setConnectionStatus(status),
      onError: (err) => setError(err.message),
      onEvent: (event) => {
        if (event.type === 'remove') {
          const removeSet = new Set(event.messageIds);
          setMessages((curr) => curr.filter((m) => !removeSet.has(m.id)));
        } else if (event.type === 'upsert') {
          setMessages((curr) => {
            const updated = [...curr];
            for (const msg of event.messages) {
              const idx = updated.findIndex((m) => m.id === msg.id);
              if (idx >= 0) {
                updated[idx] = msg;
              } else {
                updated.push(msg);
              }
            }
            return updated.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          });
          void chatRepository.markConversationRead(chatId);
        }
      },
    });

    if (subResult.data) {
      subscriptionRef.current = subResult.data;
    }
  }, [chatId, isDemo, isAuthenticated, messages]);

  useEffect(() => {
    if (!loading && chatId && !isDemo && isAuthenticated) {
      void setupSubscription();
    }

    return () => {
      if (subscriptionRef.current) {
        void subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [loading, chatId, isDemo, isAuthenticated, setupSubscription]);

  const handleCatchUp = useCallback(async () => {
    if (!chatId || isDemo || !isAuthenticated) return;
    setIsCatchingUp(true);
    const msgs = await chatRepository.listMessages(chatId, { pageSize: 50 });
    if (msgs.data) {
      setMessages(msgs.data.items);
      void chatRepository.markConversationRead(chatId);
    }
    setIsCatchingUp(false);
  }, [chatId, isDemo, isAuthenticated]);

  const handleSend = useCallback(
    async (body: string) => {
      if (!chatId || sending) return;
      const sendKey = `${chatId}:${body}:${Date.now()}`;
      if (activeSendsRef.current.has(sendKey)) return;
      activeSendsRef.current.add(sendKey);

      setSending(true);
      setError(null);

      if (isDemo) {
        const demoTransport = createDemoChatTransport();
        const optimisticId = `demo-${Date.now()}`;
        const optimisticMsg: ChatMessage = {
          id: optimisticId,
          conversationId: chatId,
          senderId: 'me',
          body,
          createdAt: new Date().toISOString(),
          timeLabel: '방금 전',
          isMine: true,
          delivery: 'confirmed',
        };
        setMessages((curr) => [...curr, optimisticMsg]);
        await demoTransport.insertMessage({
          id: optimisticId,
          conversationId: chatId,
          senderId: 'demo-current-user',
          body,
        });
        setSending(false);
        activeSendsRef.current.delete(sendKey);
        return;
      }

      let currentOptimistic: ChatMessage | null = null;

      const observer = (updatedMsg: ChatMessage) => {
        currentOptimistic = updatedMsg;
        setMessages((curr) => {
          const idx = curr.findIndex((m) => m.id === updatedMsg.id);
          if (idx >= 0) {
            const copy = [...curr];
            copy[idx] = updatedMsg;
            return copy;
          }
          return [...curr, updatedMsg];
        });
      };

      const started = await chatRepository.beginSend(chatId, body, observer);
      if (started.error) {
        setError(started.error.message);
        setSending(false);
        activeSendsRef.current.delete(sendKey);
        return;
      }

      const result = await started.data.completion;
      setSending(false);
      activeSendsRef.current.delete(sendKey);

      if (result.error) {
        setError(result.error.message);
      }
    },
    [chatId, isDemo, sending],
  );

  const handleRetry = useCallback(
    async (failedMsg: ChatMessage) => {
      if (!chatId || sending) return;
      setSending(true);
      setError(null);

      const observer = (updatedMsg: ChatMessage) => {
        setMessages((curr) => {
          const idx = curr.findIndex((m) => m.id === updatedMsg.id);
          if (idx >= 0) {
            const copy = [...curr];
            copy[idx] = updatedMsg;
            return copy;
          }
          return [...curr, updatedMsg];
        });
      };

      const retried = await chatRepository.retryMessage(failedMsg, observer);
      if (retried.error) {
        setError(retried.error.message);
        setSending(false);
        return;
      }

      const result = await retried.data.completion;
      setSending(false);
      if (result.error) {
        setError(result.error.message);
      }
    },
    [chatId, sending],
  );
  const handleMorePress = () => {
    if (!chat) return;
    Alert.alert('안전 설정 및 관리', `${chat.participantName}님과의 대화`, [
      { text: '취소', style: 'cancel' },
      {
        text: '상대방 신고',
        style: 'destructive',
        onPress: () => {
          Alert.alert('신고 사유 선택', '신고 이유를 선택해주세요.', [
            { text: '취소', style: 'cancel' },
            {
              text: '스팸/사기 의심',
              onPress: () => void submitChatReport('spam'),
            },
            {
              text: '욕설/괴롭힘',
              onPress: () => void submitChatReport('harassment'),
            },
            {
              text: '기타 사유',
              onPress: () => void submitChatReport('other'),
            },
          ]);
        },
      },
      {
        text: '사용자 차단',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            '사용자 차단',
            `${chat.participantName}님을 차단하시겠습니까? 차단 시 상대방의 메시지 및 게시물이 숨겨집니다.`,
            [
              { text: '취소', style: 'cancel' },
              {
                text: '차단',
                style: 'destructive',
                onPress: async () => {
                  if (!chat.participantId || chat.participantId.length < 10) {
                    Alert.alert('차단 실패', '유효한 사용자 정보가 없습니다.');
                    return;
                  }
                  const res = await moderationRepository.blockUser(chat.participantId);
                  if (res.error) {
                    Alert.alert('차단 실패', res.error.message);
                  } else {
                    Alert.alert('차단 완료', '상대방이 차단되었습니다.');
                  }
                },
              },
            ],
          );
        },
      },
    ]);
  };

  const submitChatReport = async (reason: 'spam' | 'harassment' | 'other') => {
    if (!chat || !chat.participantId) return;
    const targetId = chat.participantId.length >= 10 ? chat.participantId : chatId;
    const targetType = chat.participantId.length >= 10 ? 'profile' : 'message';
    const res = await moderationRepository.submitReport({
      targetType,
      targetId,
      reason,
      details: `Chat ${chatId} report`,
    });
    if (res.error) {
      Alert.alert('신고 실패', res.error.message);
    } else {
      Alert.alert('신고 완료', '신고가 접수되었습니다. 검토 후 처리됩니다.');
    }
  };

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

  if (!isAuthenticated && !isDemo) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.state}>
          <Text style={styles.stateEmoji}>🔒</Text>
          <Text style={styles.stateTitle}>로그인이 필요해요</Text>
          <Text style={styles.stateText}>대화에 참여하려면 로그인해 주세요.</Text>
          <Pressable onPress={() => router.push('/auth')} style={styles.darkButton}>
            <Text style={styles.darkButtonText}>로그인하기</Text>
          </Pressable>
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
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
          <Pressable
            accessibilityLabel="더보기"
            onPress={handleMorePress}
            style={styles.moreButton}
          >
            <Text style={styles.more}>•••</Text>
          </Pressable>
        </View>

        <ConnectionStatusHeader
          isCatchingUp={isCatchingUp}
          onCatchUp={() => void handleCatchUp()}
          status={connectionStatus}
        />

        <View style={styles.safetyNotice}>
          <Text style={styles.safetyIcon}>✓</Text>
          <Text style={styles.safetyText}>거래 전 상품 상태와 만날 장소를 꼭 확인하세요.</Text>
        </View>

        <FlatList
          ref={flatListRef}
          contentContainerStyle={styles.messageList}
          data={messages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <ChatBubble
              message={item}
              onRetry={(msg) => void handleRetry(msg)}
              participantInitial={chat.participantInitial}
            />
          )}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <ChatComposer
          disabled={!isAuthenticated && !isDemo}
          onSend={(body) => void handleSend(body)}
          sending={sending}
        />
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
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 4,
    padding: 10,
    borderRadius: radii.md,
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
  error: { color: colors.danger, fontSize: 11, paddingHorizontal: 14, paddingBottom: 4 },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  stateEmoji: { fontSize: 38, marginBottom: 12 },
  stateTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  stateText: { color: colors.muted, fontSize: 13, marginTop: 10, textAlign: 'center' },
  darkButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  darkButtonText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
});

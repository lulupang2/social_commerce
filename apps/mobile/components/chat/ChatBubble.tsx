import type { ChatMessage, MessageDelivery } from '../../lib/chat/model';
import { colors, radii } from '../../lib/theme';
import { AppText as Text } from '../../lib/typography';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

export interface ChatBubbleProps {
  message: ChatMessage;
  participantInitial?: string;
  onRetry?: (message: ChatMessage) => void;
}

export function ChatBubble({ message, participantInitial = '?', onRetry }: ChatBubbleProps) {
  const isMine = message.isMine;
  const isPending = message.delivery === 'sending';
  const isFailed = message.delivery === 'failed';

  return (
    <View style={[styles.messageRow, isMine ? styles.messageRowMine : null]}>
      {!isMine ? (
        <View style={styles.smallAvatar}>
          <Text style={styles.smallAvatarText}>{participantInitial}</Text>
        </View>
      ) : null}
      <View style={[styles.bubbleWrap, isMine ? styles.bubbleWrapMine : null]}>
        <View
          style={[
            styles.bubble,
            isMine ? styles.bubbleMine : null,
            isPending ? styles.bubblePending : null,
            isFailed ? styles.bubbleFailed : null,
          ]}
        >
          <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : null]}>
            {message.body}
          </Text>
        </View>
        <View style={[styles.metaRow, isMine ? styles.metaRowMine : null]}>
          <Text style={[styles.messageTime, isMine ? styles.messageTimeMine : null]}>
            {message.timeLabel}
          </Text>
          {isPending ? (
            <View style={styles.pendingIndicator}>
              <ActivityIndicator color={colors.subtle} size="small" />
              <Text style={styles.pendingText}>전송 중...</Text>
            </View>
          ) : isFailed ? (
            <Pressable
              accessibilityLabel="메시지 다시 보내기"
              accessibilityRole="button"
              onPress={() => onRetry?.(message)}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>⚠️ 전송 실패 · 재시도</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  bubblePending: {
    opacity: 0.7,
  },
  bubbleFailed: {
    borderColor: colors.danger,
    borderWidth: 1,
  },
  bubbleText: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  bubbleTextMine: { color: colors.surface },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  metaRowMine: { justifyContent: 'flex-end' },
  messageTime: { color: colors.subtle, fontSize: 10 },
  messageTimeMine: { textAlign: 'right' },
  pendingIndicator: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  pendingText: { color: colors.subtle, fontSize: 10 },
  retryButton: {
    backgroundColor: colors.errorSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  retryText: { color: colors.danger, fontSize: 10, fontWeight: '700' },
});

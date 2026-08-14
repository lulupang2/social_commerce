import { Pressable, StyleSheet, View } from 'react-native';

import type { ChatRealtimeStatus } from '../../lib/chat/transport';
import { colors, radii } from '../../lib/theme';
import { AppText as Text } from '../../lib/typography';

export interface ConnectionStatusHeaderProps {
  status: ChatRealtimeStatus | 'demo';
  onCatchUp?: () => void;
  isCatchingUp?: boolean;
}

export function ConnectionStatusHeader({
  status,
  onCatchUp,
  isCatchingUp = false,
}: ConnectionStatusHeaderProps) {
  if (status === 'connected') return null;

  const isDemo = status === 'demo';
  const isReconnecting = status === 'reconnecting';

  return (
    <View
      style={[
        styles.banner,
        isDemo
          ? styles.bannerDemo
          : isReconnecting
            ? styles.bannerReconnecting
            : styles.bannerClosed,
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.icon}>{isDemo ? '🧪' : isReconnecting ? '🔄' : '⚠️'}</Text>
        <Text style={styles.text}>
          {isDemo
            ? '개발 데모 모드 (로컬 메시지 처리)'
            : isReconnecting
              ? '실시간 연결을 다시 시도하는 중이에요...'
              : '채팅 연결이 끊어졌어요.'}
        </Text>
      </View>
      {onCatchUp && !isDemo ? (
        <Pressable
          accessibilityRole="button"
          disabled={isCatchingUp}
          onPress={onCatchUp}
          style={styles.catchUpButton}
        >
          <Text style={styles.catchUpText}>{isCatchingUp ? '동기화 중...' : '동기화'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bannerDemo: {
    backgroundColor: colors.warningSoft,
  },
  bannerReconnecting: {
    backgroundColor: colors.accentSoft,
  },
  bannerClosed: {
    backgroundColor: colors.errorSoft,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  icon: {
    fontSize: 13,
  },
  text: {
    color: colors.ink,
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  catchUpButton: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  catchUpText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
});

import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radii } from '../../lib/theme';
import { AppText as Text } from '../../lib/typography';

export function LoadingView({ message = '게시글을 불러오는 중...' }: { message?: string }) {
  return (
    <View
      style={styles.centerContainer}
      accessibilityRole="progressbar"
      accessibilityLabel={message}
    >
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

export function ErrorView({
  title = '오류가 발생했습니다',
  message = '데이터를 불러오는 중 문제가 발생했습니다. 다시 시도해 주세요.',
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.centerContainer} accessibilityRole="alert">
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      {onRetry && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다시 시도"
          accessibilityHint="게시글 목록을 다시 불러옵니다"
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyView({
  title = '게시글이 없습니다',
  message = '첫번째 이야기를 작성해보세요!',
  actionLabel,
  onAction,
}: {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centerContainer}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionLabel && onAction && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
        >
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function DemoModeBanner() {
  return (
    <View style={styles.demoBanner} accessibilityLabel="데모 데이터 모드 활성화됨">
      <Text style={styles.demoBannerText}>⚠️ 데모 데이터 모드로 동작 중입니다</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    minHeight: 220,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 12,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  errorMessage: {
    color: colors.ink,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  retryButtonText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyMessage: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  actionButtonText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  demoBanner: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  demoBannerText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});

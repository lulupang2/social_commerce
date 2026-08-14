import type { ListingStatus } from '@icegear/domain';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '../../lib/theme';
import { AppText } from '../../lib/typography';

export interface ListingDetailStickyCtaProps {
  isFavorite: boolean;
  isFavoriteLoading?: boolean;
  onToggleFavorite: () => void;
  onStartChat: () => void;
  isChatLoading?: boolean;
  isOwnListing: boolean;
  status: ListingStatus;
  priceText: string;
}

export function ListingDetailStickyCta({
  isFavorite,
  isFavoriteLoading = false,
  onToggleFavorite,
  onStartChat,
  isChatLoading = false,
  isOwnListing,
  status,
  priceText,
}: ListingDetailStickyCtaProps) {
  const insets = useSafeAreaInsets();
  const isSold = status === 'sold';
  const isRemoved = status === 'removed';
  const isChatDisabled = isOwnListing || isSold || isRemoved || isChatLoading;

  let chatButtonLabel = '채팅으로 문의하기';
  if (isChatLoading) {
    chatButtonLabel = '채팅 연결 중...';
  } else if (isOwnListing) {
    chatButtonLabel = '내가 등록한 상품이에요';
  } else if (isSold) {
    chatButtonLabel = '판매 완료된 상품이에요';
  } else if (isRemoved) {
    chatButtonLabel = '삭제된 상품이에요';
  }

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <View style={styles.priceContainer}>
        <AppText style={styles.priceLabel} variant="caption">
          판매가
        </AppText>
        <AppText style={styles.priceText} variant="title">
          {priceText}
        </AppText>
      </View>

      <View style={styles.actionsContainer}>
        <Pressable
          accessibilityHint="상품을 찜 목록에 추가하거나 삭제합니다"
          accessibilityLabel={isFavorite ? '찜 취소' : '찜하기'}
          accessibilityRole="button"
          accessibilityState={{ checked: isFavorite, busy: isFavoriteLoading }}
          disabled={isFavoriteLoading}
          onPress={onToggleFavorite}
          style={({ pressed }) => [
            styles.favoriteButton,
            isFavorite && styles.favoriteButtonActive,
            pressed && styles.pressed,
          ]}
        >
          {isFavoriteLoading ? (
            <ActivityIndicator color={isFavorite ? colors.accent : colors.text} size="small" />
          ) : (
            <AppText style={[styles.favoriteIcon, isFavorite && styles.favoriteIconActive]}>
              {isFavorite ? '♥' : '♡'}
            </AppText>
          )}
        </Pressable>

        <Pressable
          accessibilityHint={isChatDisabled ? undefined : '판매자와 1:1 채팅을 시작합니다'}
          accessibilityLabel={chatButtonLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: isChatDisabled, busy: isChatLoading }}
          disabled={isChatDisabled}
          onPress={onStartChat}
          style={({ pressed }) => [
            styles.chatButton,
            isChatDisabled && styles.chatButtonDisabled,
            pressed && !isChatDisabled && styles.pressed,
          ]}
        >
          {isChatLoading ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <AppText
              style={[styles.chatButtonText, isChatDisabled && styles.chatButtonTextDisabled]}
              variant="bodyStrong"
            >
              {chatButtonLabel}
            </AppText>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    elevation: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    position: 'absolute',
    right: 0,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    zIndex: 10,
  },
  priceContainer: {
    justifyContent: 'center',
  },
  priceLabel: {
    color: colors.textMuted,
  },
  priceText: {
    color: colors.text,
    fontFamily: undefined,
  },
  actionsContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  favoriteButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  favoriteButtonActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  favoriteIcon: {
    color: colors.text,
    fontSize: 22,
  },
  favoriteIconActive: {
    color: colors.accent,
  },
  chatButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  chatButtonDisabled: {
    backgroundColor: colors.disabledSurface,
  },
  chatButtonText: {
    color: colors.textInverse,
  },
  chatButtonTextDisabled: {
    color: colors.disabledText,
  },
  pressed: {
    opacity: 0.8,
  },
});

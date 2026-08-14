import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { Avatar } from '../ui/Avatar';
import { Chip } from '../ui/Chip';

export interface ListingDetailSellerCardProps {
  sellerId: string;
  isOwnListing: boolean;
  isBlocked?: boolean;
  onReportSeller?: () => void;
  onBlockSeller?: () => void;
}

export function ListingDetailSellerCard({
  sellerId,
  isOwnListing,
  isBlocked,
  onReportSeller,
  onBlockSeller,
}: ListingDetailSellerCardProps) {
  const sellerDisplayName = isOwnListing ? '내 게시글' : 'IceGear 판매자';
  const subtitle = isOwnListing
    ? '내가 등록한 상품입니다.'
    : isBlocked
      ? '차단된 판매자입니다.'
      : '안전한 거래를 위해 채팅으로 문의해주세요.';
  return (
    <View accessibilityLabel={`판매자 정보: ${sellerDisplayName}`} style={styles.container}>
      <Avatar name={sellerDisplayName} size={42} />
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <AppText style={styles.name} variant="bodyStrong">
            {sellerDisplayName}
          </AppText>
          {isOwnListing ? <Chip label="내 상품" selected /> : null}
        </View>
        <AppText style={styles.subtitle} variant="caption">
          {subtitle}
        </AppText>
      </View>
      {!isOwnListing && (onReportSeller || onBlockSeller) ? (
        <View style={styles.actionRow}>
          {onReportSeller ? (
            <Pressable
              accessibilityLabel="판매자 신고"
              accessibilityRole="button"
              onPress={onReportSeller}
              style={styles.actionButton}
            >
              <AppText style={styles.actionText} variant="caption">
                신고
              </AppText>
            </Pressable>
          ) : null}
          {onBlockSeller ? (
            <Pressable
              accessibilityLabel={isBlocked ? '차단 해제' : '판매자 차단'}
              accessibilityRole="button"
              onPress={onBlockSeller}
              style={styles.actionButton}
            >
              <AppText style={styles.actionText} variant="caption">
                {isBlocked ? '차단 해제' : '차단'}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  content: {
    flex: 1,
    gap: spacing.xxs,
  },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  name: {
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  actionText: {
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
});

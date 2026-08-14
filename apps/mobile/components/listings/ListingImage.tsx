import type { ListingImage as ListingImageData, ListingStatus } from '@icegear/domain';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { statusLabels } from '../../lib/format';
import { colors, radii, spacing } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { AppIcon } from '../ui/AppIcon';

export interface ListingImageProps {
  image?: ListingImageData | string | null;
  title: string;
  aspectRatio?: number;
  status?: ListingStatus;
  style?: StyleProp<ViewStyle>;
}

export function ListingImage({ image, title, aspectRatio = 1, status, style }: ListingImageProps) {
  const uri = typeof image === 'string' ? image : image?.url;
  const altText = typeof image === 'string' ? `${title} 상품 이미지` : image?.altText || `${title} 상품 이미지`;
  const unavailable = status === 'sold' || status === 'reserved';

  return (
    <View style={[styles.container, { aspectRatio }, style]}>
      {uri ? (
        <Image accessibilityLabel={altText} resizeMode="cover" source={{ uri }} style={styles.image} />
      ) : (
        <View accessibilityLabel={`${title} 이미지 없음`} accessibilityRole="image" style={styles.placeholder}>
          <AppIcon color={colors.textSubtle} name="image" size={32} />
          <AppText style={styles.placeholderText} variant="caption">
            이미지 준비 중
          </AppText>
        </View>
      )}
      {unavailable ? (
        <View style={styles.status}>
          <AppText style={styles.statusText} variant="label">
            {statusLabels[status]}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surfaceSubtle, borderRadius: radii.md, overflow: 'hidden', position: 'relative', width: '100%' },
  image: { height: '100%', width: '100%' },
  placeholder: { alignItems: 'center', flex: 1, gap: spacing.xs, justifyContent: 'center' },
  placeholderText: { color: colors.textSubtle },
  status: { backgroundColor: colors.scrim, borderRadius: radii.pill, left: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, position: 'absolute', top: spacing.sm },
  statusText: { color: colors.textInverse },
});

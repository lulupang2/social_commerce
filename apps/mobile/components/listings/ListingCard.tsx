import { useState } from 'react';
import type { Listing } from '@icegear/domain';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { conditionLabels, formatLocation, formatPrice } from '../../lib/format';
import { colors, elevation, interaction, radii, spacing, stateStyles } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { Chip } from '../ui/Chip';
import { IconButton } from '../ui/IconButton';
import { ListingImage } from './ListingImage';
import { RecommendationReason } from './RecommendationReason';

export interface ListingCardProps {
  listing: Listing;
  onPress: (listing: Listing) => void;
  onFavoritePress?: (listing: Listing) => void;
  favorite?: boolean;
  favoritePending?: boolean;
  recommendationReason?: string;
  variant?: 'grid' | 'rail' | 'horizontal';
  style?: StyleProp<ViewStyle>;
}

export function ListingCard({
  listing,
  onPress,
  onFavoritePress,
  favorite = false,
  favoritePending = false,
  recommendationReason,
  variant = 'grid',
  style,
}: ListingCardProps) {
  const [focused, setFocused] = useState(false);
  const horizontal = variant === 'horizontal';
  const navigationLabel = `${listing.title}, ${formatPrice(listing)}, ${formatLocation(listing.location)}`;

  return (
    <View style={[styles.shell, variant === 'rail' && styles.rail, horizontal && styles.horizontalShell, style]}>
      <Pressable
        accessibilityHint="상품 상세 화면으로 이동합니다"
        accessibilityLabel={navigationLabel}
        accessibilityRole="link"
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        onPress={() => onPress(listing)}
        style={({ pressed }) => [
          styles.navigation,
          horizontal && styles.horizontalNavigation,
          pressed && styles.pressed,
          focused && stateStyles.focus,
        ]}
      >
        <ListingImage
          aspectRatio={horizontal ? 1 : 1.08}
          image={listing.images[0]}
          status={listing.status}
          style={horizontal ? styles.horizontalImage : undefined}
          title={listing.title}
        />
        <View style={styles.copy}>
          <View style={styles.metaRow}>
            <Chip label={conditionLabels[listing.condition]} />
          </View>
          <AppText numberOfLines={2} style={styles.title} variant="bodyStrong">
            {listing.title}
          </AppText>
          <AppText numberOfLines={1} style={styles.location} variant="caption">
            {formatLocation(listing.location)}
          </AppText>
          <AppText numberOfLines={1} style={styles.price} variant="price">
            {formatPrice(listing)}
          </AppText>
          {recommendationReason ? <RecommendationReason reason={recommendationReason} /> : null}
        </View>
      </Pressable>
      {onFavoritePress ? (
        <IconButton
          accessibilityLabel={favorite ? `${listing.title} 찜 해제` : `${listing.title} 찜하기`}
          disabled={favoritePending}
          icon="heart"
          onPress={() => onFavoritePress(listing)}
          selected={favorite}
          style={styles.favorite}
          tone="surface"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { backgroundColor: colors.surface, borderRadius: radii.lg, minWidth: 0, position: 'relative', ...elevation.low },
  rail: { width: 224 },
  horizontalShell: { minHeight: 144 },
  navigation: { borderRadius: radii.lg, minHeight: interaction.minimumTarget, overflow: 'hidden' },
  horizontalNavigation: { flexDirection: 'row' },
  pressed: { opacity: interaction.pressedOpacity },
  horizontalImage: { alignSelf: 'stretch', aspectRatio: undefined, borderBottomRightRadius: 0, borderTopRightRadius: 0, width: 132 },
  copy: { flex: 1, gap: spacing.xs, padding: spacing.md },
  metaRow: { alignItems: 'center', flexDirection: 'row', minHeight: 28 },
  title: { color: colors.text },
  location: { color: colors.textMuted },
  price: { color: colors.text, marginTop: spacing.xs },
  favorite: { position: 'absolute', right: spacing.sm, top: spacing.sm, ...elevation.low },
});

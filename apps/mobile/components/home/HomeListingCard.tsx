import { useState } from 'react';
import type { Listing } from '@icegear/domain';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { conditionLabels, formatLocation, formatPrice, formatTime } from '../../lib/format';
import { colors, elevation, interaction, radii, spacing, stateStyles } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { ListingImage } from '../listings/ListingImage';
import { RecommendationReason } from '../listings/RecommendationReason';
import { Chip } from '../ui/Chip';
import { IconButton } from '../ui/IconButton';

export interface HomeListingCardProps {
  listing: Listing;
  onPress: (listing: Listing) => void;
  onFavoritePress?: (listing: Listing) => void;
  favorite?: boolean;
  favoritePending?: boolean;
  recommendationReason?: string;
  variant?: 'grid' | 'rail';
  style?: StyleProp<ViewStyle>;
}

export function HomeListingCard({
  listing,
  onPress,
  onFavoritePress,
  favorite = false,
  favoritePending = false,
  recommendationReason,
  variant = 'grid',
  style,
}: HomeListingCardProps) {
  const [focused, setFocused] = useState(false);
  const rail = variant === 'rail';
  const location = formatLocation(listing.location);
  const age = formatTime(listing.createdAt);
  const navigationLabel = `${listing.title}, ${formatPrice(listing)}, ${location}`;

  return (
    <View style={[styles.shell, rail && styles.rail, style]}>
      <Pressable
        accessibilityHint="상품 상세 화면으로 이동합니다"
        accessibilityLabel={navigationLabel}
        accessibilityRole="link"
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        onPress={() => onPress(listing)}
        style={({ pressed }) => [
          styles.navigation,
          pressed && styles.pressed,
          focused && stateStyles.focus,
        ]}
      >
        <ListingImage
          aspectRatio={rail ? 1.14 : 1.08}
          category={listing.category}
          image={listing.images[0]}
          sport={listing.sport}
          status={listing.status}
          title={listing.title}
        />
        <View style={styles.copy}>
          <View style={styles.metaRow}>
            <Chip label={conditionLabels[listing.condition] ?? listing.condition} />
            {age ? (
              <AppText numberOfLines={1} style={styles.age} variant="caption">
                {age}
              </AppText>
            ) : null}
          </View>
          <AppText numberOfLines={2} style={styles.title} variant="bodyStrong">
            {listing.title}
          </AppText>
          <AppText numberOfLines={1} style={styles.location} variant="caption">
            {location}
          </AppText>
          <AppText numberOfLines={1} style={styles.price} variant="price">
            {formatPrice(listing)}
          </AppText>
          {recommendationReason ? (
            <RecommendationReason compact reason={recommendationReason} />
          ) : null}
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
  shell: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
    ...elevation.low,
  },
  rail: {
    flex: 0,
    width: 224,
  },
  navigation: {
    borderRadius: radii.lg,
    minHeight: interaction.minimumTarget,
    overflow: 'hidden',
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 28,
  },
  age: {
    color: colors.textSubtle,
    flexShrink: 1,
  },
  title: {
    color: colors.text,
    minHeight: 44,
  },
  location: {
    color: colors.textMuted,
  },
  price: {
    color: colors.text,
    marginTop: spacing.xs,
  },
  favorite: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    ...elevation.low,
  },
});

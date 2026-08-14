import type { Listing } from '@icegear/domain';
import { FlatList, StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radii, spacing } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { HomeListingCard } from './HomeListingCard';

export interface HomeRecommendationRailProps extends ViewProps {
  title?: string;
  subtitle?: string;
  listings: readonly Listing[];
  onListingPress: (listing: Listing) => void;
  onFavoritePress?: (listing: Listing) => void;
  favoriteIds?: Readonly<Record<string, boolean>>;
  pendingFavoriteIds?: Readonly<Record<string, boolean>>;
  reasons?: Readonly<Record<string, string>>;
  emptyMessage?: string;
}

export function HomeRecommendationRail({
  title = '맞춤 추천 장비',
  subtitle = '이번 겨울 시즌 인기 장비 모음',
  listings,
  onListingPress,
  onFavoritePress,
  favoriteIds,
  pendingFavoriteIds,
  reasons,
  emptyMessage = '추천 상품을 준비하고 있어요.',
  style,
  ...props
}: HomeRecommendationRailProps) {
  if (listings.length === 0) {
    return null;
  }

  return (
    <View {...props} style={[styles.container, style]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <AppText style={styles.title} variant="headline">
            {title}
          </AppText>
          <View style={styles.badge}>
            <AppText style={styles.badgeText} variant="caption">
              MATCHED
            </AppText>
          </View>
        </View>
        {subtitle ? (
          <AppText style={styles.subtitle} variant="caption">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <FlatList
        contentContainerStyle={styles.content}
        data={listings}
        horizontal
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <HomeListingCard
            favorite={Boolean(favoriteIds?.[item.id])}
            favoritePending={Boolean(pendingFavoriteIds?.[item.id])}
            listing={item}
            onFavoritePress={onFavoritePress}
            onPress={onListingPress}
            recommendationReason={reasons?.[item.id]}
            variant="rail"
          />
        )}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
    paddingVertical: spacing.md,
  },
  header: {
    gap: spacing.xxs,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
  },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  badgeText: {
    color: colors.textInverse,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  subtitle: {
    color: colors.textMuted,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
    paddingTop: spacing.xs,
  },
});

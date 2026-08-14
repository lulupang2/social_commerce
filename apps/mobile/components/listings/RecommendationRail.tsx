import type { Listing } from '@icegear/domain';
import { FlatList, StyleSheet, View, type ViewProps } from 'react-native';

import { colors, spacing } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { ListingCard } from './ListingCard';

export interface RecommendationRailProps extends ViewProps {
  title: string;
  subtitle?: string;
  listings: readonly Listing[];
  onListingPress: (listing: Listing) => void;
  onFavoritePress?: (listing: Listing) => void;
  favoriteIds?: Readonly<Record<string, boolean>>;
  pendingFavoriteIds?: Readonly<Record<string, boolean>>;
  reasons?: Readonly<Record<string, string>>;
  emptyMessage?: string;
}

export function RecommendationRail({
  title,
  subtitle,
  listings,
  onListingPress,
  onFavoritePress,
  favoriteIds,
  pendingFavoriteIds,
  reasons,
  emptyMessage = '추천 상품을 준비하고 있어요.',
  style,
  ...props
}: RecommendationRailProps) {

  return (
    <View {...props} style={[styles.container, style]}>
      <View style={styles.header}>
        <AppText style={styles.title} variant="headline">
          {title}
        </AppText>
        {subtitle ? (
          <AppText style={styles.subtitle} variant="body">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {listings.length ? (
        <FlatList
          contentContainerStyle={styles.content}
          data={listings}
          horizontal
          keyExtractor={(listing) => listing.id}
          renderItem={({ item }) => (
            <ListingCard
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
      ) : (
        <AppText style={styles.empty} variant="body">
          {emptyMessage}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  header: { gap: spacing.xs, paddingHorizontal: spacing.page },
  title: { color: colors.text },
  subtitle: { color: colors.textMuted },
  content: { gap: spacing.md, paddingHorizontal: spacing.page, paddingBottom: spacing.sm },
  empty: { color: colors.textMuted, paddingHorizontal: spacing.page, paddingVertical: spacing.xxl },
});

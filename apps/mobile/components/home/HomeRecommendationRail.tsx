import type { Listing } from '@icegear/domain';
import { useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';

import { colors, radii, spacing } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { AppIcon } from '../ui/AppIcon';
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

const CARD_WIDTH = 224;
const CARD_GAP = spacing.md;
const SCROLL_STEP = CARD_WIDTH + CARD_GAP;

export function HomeRecommendationRail({
  title = '맞춤 추천 장비',
  subtitle = '이번 겨울 시즌 인기 장비 모음',
  listings,
  onListingPress,
  onFavoritePress,
  favoriteIds,
  pendingFavoriteIds,
  reasons,
  emptyMessage = '맞춤 추천 장비를 준비하고 있어요.',
  style,
  ...props
}: HomeRecommendationRailProps) {
  const listRef = useRef<FlatList<Listing>>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const count = listings.length;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollOffset(e.nativeEvent.contentOffset.x);
  };

  const scrollLeft = () => {
    const target = Math.max(0, scrollOffset - SCROLL_STEP);
    listRef.current?.scrollToOffset({ offset: target, animated: true });
  };

  const scrollRight = () => {
    const target = scrollOffset + SCROLL_STEP;
    listRef.current?.scrollToOffset({ offset: target, animated: true });
  };

  return (
    <View {...props} style={[styles.container, style]}>
      <View style={styles.header}>
        <View style={styles.titleColumn}>
          <View style={styles.titleRow}>
            <AppText style={styles.title} variant="headline">
              {title}
            </AppText>
            <View style={styles.badge}>
              <AppText style={styles.badgeText} variant="caption">
                MATCHED
              </AppText>
            </View>
            {count > 0 ? (
              <View style={styles.countBadge}>
                <AppText style={styles.countBadgeText} variant="caption">
                  {count}개
                </AppText>
              </View>
            ) : null}
          </View>
          {subtitle ? (
            <AppText style={styles.subtitle} variant="caption">
              {subtitle}
            </AppText>
          ) : null}
        </View>

        {count > 1 ? (
          <View style={styles.navControls}>
            <Pressable
              accessibilityLabel="이전 추천 장비 보기"
              accessibilityRole="button"
              disabled={scrollOffset <= 0}
              onPress={scrollLeft}
              style={({ pressed }) => [
                styles.navButton,
                scrollOffset <= 0 && styles.navButtonDisabled,
                pressed && styles.navButtonPressed,
              ]}
            >
              <AppIcon
                color={scrollOffset <= 0 ? colors.textSubtle : colors.text}
                name="back"
                size={16}
              />
            </Pressable>
            <Pressable
              accessibilityLabel="다음 추천 장비 보기"
              accessibilityRole="button"
              onPress={scrollRight}
              style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
            >
              <AppIcon color={colors.text} name="chevronRight" size={16} />
            </Pressable>
          </View>
        ) : null}
      </View>

      {count > 0 ? (
        <FlatList
          contentContainerStyle={styles.content}
          data={listings}
          horizontal
          keyExtractor={(item) => item.id}
          onScroll={handleScroll}
          ref={listRef}
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
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <AppIcon color={colors.textSubtle} name="info" size={24} />
          <AppText style={styles.emptyText} variant="caption">
            {emptyMessage}
          </AppText>
        </View>
      )}
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
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleColumn: {
    flex: 1,
    gap: spacing.xxs,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  countBadge: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  countBadgeText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textMuted,
  },
  navControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  navButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
    paddingTop: spacing.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
  },
});

import type { Listing } from '@icegear/domain';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, SafeAreaView, StyleSheet, View } from 'react-native';

import {
  EditorialHeader,
  HomeFilterRow,
  HomeListingCard,
  HomeRecommendationRail,
  type SportFilter,
} from '../../components/home';
import { StateView } from '../../components/ui/StateView';
import { favoritesRepository } from '../../lib/favorites/repository';
import { formatLocation } from '../../lib/format';
import { listingRepository, type ListingRepositoryError } from '../../lib/listings/repository';
import { colors, spacing } from '../../lib/theme';
import { getCurrentProfile, type CurrentProfile } from '../../lib/profile';
import {
  adaptListingToRecommendationInput,
  adaptProfileToRecommendationSports,
  generateRecommendations,
} from '../../lib/recommendations';
export default function MarketHomeScreen() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [query, setQuery] = useState('');
  const [sportFilter, setSportFilter] = useState<SportFilter>('all');
  const [favoriteIds, setFavoriteIds] = useState<Record<string, boolean>>({});
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ListingRepositoryError | null>(null);
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null);
  const loadListings = useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const result = await listingRepository.listActive();
    if (result.error) {
      setError(result.error);
      setListings([]);
    } else {
      setError(null);
      setListings(result.data);
    }

    try {
      const favResult = await favoritesRepository.list({ limit: 100 });
      if (favResult.data?.items) {
        const map: Record<string, boolean> = {};
        for (const item of favResult.data.items) {
          map[item.listingId] = true;
        }
        setFavoriteIds(map);
      }
    } catch {
      // Non-blocking fallback for favorites
    }
    try {
      const profResult = await getCurrentProfile();
      if (profResult.data) {
        setCurrentProfile(profResult.data);
      }
    } catch {
      // Non-blocking fallback for profile
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  const visibleListings = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return listings.filter((listing) => {
      if (sportFilter !== 'all' && listing.sport !== sportFilter) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      const searchableText = [listing.title, listing.description, formatLocation(listing.location)]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalized);
    });
  }, [listings, query, sportFilter]);

  const recommendationResult = useMemo(() => {
    if (listings.length === 0) return null;
    const inputListings = listings.map(adaptListingToRecommendationInput);
    const profileSports = adaptProfileToRecommendationSports(currentProfile?.sports);
    return generateRecommendations(
      {
        profileSports,
        listings: inputListings,
        asOf: new Date().toISOString(),
      },
      { limit: 10 },
    );
  }, [listings, currentProfile]);

  const recommendationReasons = useMemo(() => {
    if (!recommendationResult) return {};
    const map: Record<string, string> = {};
    for (const item of recommendationResult.items) {
      map[item.listingId] = item.reasonText;
    }
    return map;
  }, [recommendationResult]);

  const recommendedListings = useMemo(() => {
    if (!recommendationResult || recommendationResult.items.length === 0) return [];
    const listingMap = new Map(listings.map((l) => [l.id, l]));
    const ordered: Listing[] = [];
    for (const item of recommendationResult.items) {
      const listing = listingMap.get(item.listingId);
      if (listing) {
        ordered.push(listing);
      }
    }
    return ordered;
  }, [listings, recommendationResult]);

  const handleToggleFavorite = useCallback(
    async (listing: Listing) => {
      const id = listing.id;
      const currentStatus = Boolean(favoriteIds[id]);
      const nextStatus = !currentStatus;

      setFavoriteIds((prev) => ({ ...prev, [id]: nextStatus }));
      setPendingFavoriteIds((prev) => ({ ...prev, [id]: true }));

      const result = await favoritesRepository.toggle(id);
      if (result.error) {
        setFavoriteIds((prev) => ({ ...prev, [id]: currentStatus }));
      }

      setPendingFavoriteIds((prev) => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
    },
    [favoriteIds],
  );

  const handleOpenListing = useCallback(
    (listing: Listing) => {
      const reason = recommendationReasons[listing.id];
      if (reason) {
        router.push({
          pathname: '/listing/[id]',
          params: { id: listing.id, recommendationReason: reason },
        });
      } else {
        router.push(`/listing/${listing.id}`);
      }
    },
    [router, recommendationReasons],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.outerContainer}>
        <FlatList
          columnWrapperStyle={visibleListings.length > 0 ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.listContent}
          data={visibleListings}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            loading ? (
              <StateView
                kind="loading"
                message="따뜻한 겨울 장비를 찾고 계시는 중입니다..."
                title="장비를 불러오는 중"
              />
            ) : error ? (
              <StateView
                actionLabel="다시 시도"
                kind="error"
                message={error.message}
                onAction={() => void loadListings()}
                title="마켓을 불러오지 못했어요"
              />
            ) : (
              <StateView
                actionLabel="필터 초기화"
                kind="empty"
                message="검색어나 스포츠 필터를 변경해 보세요."
                onAction={() => {
                  setQuery('');
                  setSportFilter('all');
                }}
                title="조건에 맞는 장비가 없어요"
              />
            )
          }
          ListHeaderComponent={
            <View style={styles.headerContainer}>
              <EditorialHeader
                onClearQuery={() => setQuery('')}
                onQueryChange={setQuery}
                query={query}
              />

              {!query && recommendedListings.length > 0 ? (
                <HomeRecommendationRail
                  favoriteIds={favoriteIds}
                  listings={recommendedListings}
                  onFavoritePress={handleToggleFavorite}
                  onListingPress={handleOpenListing}
                  pendingFavoriteIds={pendingFavoriteIds}
                  reasons={recommendationReasons}
                />
              ) : null}

              <View style={styles.sectionHeader}>
                <HomeFilterRow
                  onSelectSport={setSportFilter}
                  selectedSport={sportFilter}
                  totalCount={visibleListings.length}
                />
              </View>
            </View>
          }
          numColumns={2}
          refreshControl={
            <RefreshControl
              colors={[colors.accent]}
              onRefresh={() => void loadListings(true)}
              refreshing={refreshing}
            />
          }
          renderItem={({ item }) => (
            <HomeListingCard
              favorite={Boolean(favoriteIds[item.id])}
              favoritePending={Boolean(pendingFavoriteIds[item.id])}
              listing={item}
              onFavoritePress={handleToggleFavorite}
              onPress={handleOpenListing}
              recommendationReason={recommendationReasons[item.id]}
              variant="grid"
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  outerContainer: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 1024,
    width: '100%',
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.page,
  },
  headerContainer: {
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionHeader: {
    paddingTop: spacing.xs,
  },
  columnWrapper: {
    gap: spacing.md,
  },
});

import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';

import type { Listing } from '@icegear/domain';

import { listingRepository, type ListingRepositoryError } from '../../lib/listings/repository';
import {
  categoryLabels,
  colors,
  conditionLabels,
  formatLocation,
  formatPrice,
  formatTime,
  radii,
  sportLabels,
} from '../../lib/theme';
import { AppText as Text, AppTextInput as TextInput, fontFamilies } from '../../lib/typography';

type SportFilter = 'all' | 'ski' | 'hockey';

const filterOptions: Array<{ id: SportFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'ski', label: '스키' },
  { id: 'hockey', label: '아이스하키' },
];

function ListingImage({ listing }: { listing: Listing }) {
  const [failed, setFailed] = useState(false);
  const image = listing.images[0];
  if (!image || failed) {
    return (
      <View style={[styles.image, styles.imageFallback]}>
        <Text style={styles.imageEmoji}>{listing.sport === 'ski' ? '⛷' : '🏒'}</Text>
        <Text style={styles.imageFallbackText}>{sportLabels[listing.sport]} 장비</Text>
      </View>
    );
  }
  return (
    <Image
      accessibilityLabel={listing.title}
      onError={() => setFailed(true)}
      source={{ uri: image.url }}
      style={styles.image}
    />
  );
}

function ListingCard({
  listing,
  saved,
  onOpen,
  onToggleSave,
}: {
  listing: Listing;
  saved: boolean;
  onOpen: () => void;
  onToggleSave: () => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.cardOpenButton}>
        <View style={styles.cardImageWrap}>
          <ListingImage listing={listing} />
          <View style={styles.imageBadge}>
            <Text style={styles.imageBadgeText}>{sportLabels[listing.sport]}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {listing.title}
          </Text>
          <Text style={styles.cardPrice}>{formatPrice(listing)}</Text>
          <View style={styles.cardMetaRow}>
            <Text style={styles.cardMeta}>{formatLocation(listing.location)}</Text>
            <Text style={styles.cardMeta}>{formatTime(listing.createdAt)}</Text>
          </View>
          <Text style={styles.cardCondition}>
            {categoryLabels[listing.category] ?? listing.category} ·{' '}
            {conditionLabels[listing.condition] ?? listing.condition}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel={saved ? '찜 취소' : '찜하기'}
        accessibilityRole="button"
        hitSlop={10}
        onPress={onToggleSave}
        style={styles.heartButton}
      >
        <Text style={[styles.heart, saved ? styles.heartSaved : null]}>{saved ? '♥' : '♡'}</Text>
      </Pressable>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.centerState}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.centerStateText}>따뜻한 장비를 찾고 있어요</Text>
    </View>
  );
}

function ErrorState({ error, onRetry }: { error: ListingRepositoryError; onRetry: () => void }) {
  return (
    <View style={styles.centerState}>
      <Text style={styles.centerStateIcon}>!</Text>
      <Text style={styles.centerStateTitle}>마켓을 불러오지 못했어요</Text>
      <Text style={styles.centerStateText}>{error.message}</Text>
      <Pressable onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryButtonText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

export default function MarketHomeScreen() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [query, setQuery] = useState('');
  const [sportFilter, setSportFilter] = useState<SportFilter>('all');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ListingRepositoryError | null>(null);

  const loadListings = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    const result = await listingRepository.listActive();
    if (result.error) setError(result.error);
    else {
      setError(null);
      setListings(result.data);
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
      if (sportFilter !== 'all' && listing.sport !== sportFilter) return false;
      if (!normalized) return true;
      return [listing.title, listing.description, formatLocation(listing.location)]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [listings, query, sportFilter]);

  function toggleSave(id: string) {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={visibleListings}
        keyExtractor={(listing) => listing.id}
        ListEmptyComponent={
          loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void loadListings()} />
          ) : (
            <View style={styles.centerState}>
              <Text style={styles.centerStateIcon}>⌕</Text>
              <Text style={styles.centerStateTitle}>조건에 맞는 장비가 없어요</Text>
              <Text style={styles.centerStateText}>검색어나 필터를 바꿔보세요.</Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl
            colors={[colors.accent]}
            refreshing={refreshing}
            onRefresh={() => void loadListings(true)}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.topBar}>
              <View>
                <Text style={styles.greeting}>안녕하세요, 겨울러버님</Text>
                <Pressable accessibilityRole="button" style={styles.locationButton}>
                  <Text style={styles.locationPin}>⌖</Text>
                  <Text style={styles.locationText}>서울 · 내 주변</Text>
                  <Text style={styles.chevron}>⌄</Text>
                </Pressable>
              </View>
              <Pressable accessibilityLabel="알림" style={styles.notificationButton}>
                <Text style={styles.notificationIcon}>♧</Text>
                <View style={styles.notificationDot} />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                accessibilityLabel="장비 검색"
                onChangeText={setQuery}
                placeholder="찾고 싶은 장비를 검색해보세요"
                placeholderTextColor={colors.subtle}
                returnKeyType="search"
                style={styles.searchInput}
                value={query}
              />
              {query ? (
                <Pressable accessibilityLabel="검색어 지우기" onPress={() => setQuery('')}>
                  <Text style={styles.clearSearch}>×</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.hero}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroKicker}>ICEGEAR PICK</Text>
                <Text style={styles.heroTitle}>
                  이번 겨울,{`\n`}내 장비를 찾는 가장 가까운 방법
                </Text>
                <Text style={styles.heroBody}>스키와 하키 장비를 믿을 수 있는 이웃과 나눠요.</Text>
              </View>
              <Text style={styles.heroArt}>⛷</Text>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>NEARBY MARKET</Text>
                <Text style={styles.sectionTitle}>지금 올라온 장비</Text>
              </View>
              <Link href="/(tabs)/sell" asChild>
                <Pressable style={styles.sellLink}>
                  <Text style={styles.sellLinkText}>내 물건 팔기</Text>
                </Pressable>
              </Link>
            </View>

            <View style={styles.filterRow}>
              {filterOptions.map((option) => {
                const selected = sportFilter === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => setSportFilter(option.id)}
                    style={[styles.filterChip, selected ? styles.filterChipSelected : null]}
                  >
                    <Text style={[styles.filterText, selected ? styles.filterTextSelected : null]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            onOpen={() => router.push(`/listing/${item.id}`)}
            onToggleSave={() => toggleSave(item.id)}
            saved={savedIds.has(item.id)}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  listContent: { paddingBottom: 24, paddingHorizontal: 18 },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 17,
    paddingTop: 12,
  },
  greeting: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  locationButton: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 5 },
  locationPin: { color: colors.accent, fontSize: 17, fontWeight: '800' },
  locationText: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  chevron: { color: colors.muted, fontSize: 17, marginLeft: 1 },
  notificationButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  notificationIcon: { color: colors.ink, fontSize: 21, transform: [{ rotate: '180deg' }] },
  notificationDot: {
    backgroundColor: colors.accent,
    borderColor: colors.surface,
    borderRadius: 5,
    borderWidth: 2,
    height: 10,
    position: 'absolute',
    right: 7,
    top: 6,
    width: 10,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    height: 50,
    paddingHorizontal: 14,
  },
  searchIcon: { color: colors.ink, fontSize: 23, marginRight: 8 },
  searchInput: { color: colors.ink, flex: 1, fontSize: 14, paddingVertical: 0 },
  clearSearch: { color: colors.subtle, fontSize: 23, paddingLeft: 8 },
  hero: {
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    flexDirection: 'row',
    marginTop: 16,
    minHeight: 148,
    overflow: 'hidden',
    padding: 20,
  },
  heroCopy: { flex: 1, zIndex: 1 },
  heroKicker: {
    color: '#B7C9E5',
    fontFamily: fontFamilies.accentBold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  heroTitle: {
    color: colors.surface,
    fontFamily: fontFamilies.displayExtraBold,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 27,
    marginTop: 7,
  },
  heroBody: { color: '#D6E0EF', fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 220 },
  heroArt: {
    color: '#F5B67F',
    fontSize: 78,
    opacity: 0.95,
    position: 'absolute',
    right: 15,
    top: 47,
    transform: [{ rotate: '-12deg' }],
  },
  sectionHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 25,
  },
  sectionEyebrow: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.displayBold,
    fontSize: 21,
    fontWeight: '800',
    marginTop: 5,
  },
  sellLink: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  sellLinkText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 15, marginTop: 15 },
  filterChip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  filterChipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  filterTextSelected: { color: colors.surface },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    marginBottom: 13,
    overflow: 'hidden',
    position: 'relative',
  },
  cardOpenButton: { width: '100%' },
  cardImageWrap: { height: 178, position: 'relative' },
  image: { backgroundColor: '#E7EDF2', height: '100%', width: '100%' },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  imageEmoji: { fontSize: 52, marginBottom: 4 },
  imageFallbackText: { color: colors.navy, fontSize: 12, fontWeight: '800' },
  heartButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: radii.pill,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 12,
    top: 12,
    width: 34,
  },
  heart: { color: colors.ink, fontSize: 21, lineHeight: 23 },
  heartSaved: { color: colors.accent },
  imageBadge: {
    backgroundColor: 'rgba(32,33,36,0.76)',
    borderRadius: radii.pill,
    bottom: 11,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    position: 'absolute',
  },
  imageBadgeText: { color: colors.surface, fontSize: 11, fontWeight: '800' },
  cardBody: { padding: 14 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  cardPrice: {
    color: colors.ink,
    fontFamily: fontFamilies.accentBold,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.2,
    marginTop: 8,
  },
  cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  cardMeta: { color: colors.muted, fontSize: 12 },
  cardCondition: { color: colors.subtle, fontSize: 11, marginTop: 8 },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 260,
    paddingHorizontal: 26,
  },
  centerStateIcon: { color: colors.accent, fontSize: 38, fontWeight: '300', marginBottom: 9 },
  centerStateTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  centerStateText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryButtonText: { color: colors.surface, fontSize: 13, fontWeight: '800' },
});

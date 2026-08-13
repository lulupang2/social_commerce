import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Listing } from '@icegear/domain';

import { listingRepository, type ListingRepositoryError } from '../lib/listings/repository';
import { isSupabaseConfigured } from '../lib/supabase/client';

function formatPrice(listing: Listing): string {
  return `${listing.price.currency} ${listing.price.amount.toLocaleString()}`;
}

function ListingCard({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{listing.title}</Text>
        <Text style={styles.price}>{formatPrice(listing)}</Text>
      </View>
      <Text style={styles.meta}>
        {listing.sport} · {listing.category} · {listing.condition}
      </Text>
      {listing.location ? <Text style={styles.location}>{String(listing.location)}</Text> : null}
      {listing.description ? (
        <Text numberOfLines={2} style={styles.description}>
          {listing.description}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ErrorState({ error, onRetry }: { error: ListingRepositoryError; onRetry: () => void }) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>
        {error.code === 'not_configured'
          ? 'Marketplace is not configured'
          : 'Could not load listings'}
      </Text>
      <Text style={styles.stateBody}>{error.message}</Text>
      {error.code !== 'not_configured' ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState<ListingRepositoryError | null>(() =>
    isSupabaseConfigured
      ? null
      : {
          code: 'not_configured',
          message: 'Connect Supabase to browse or publish marketplace listings.',
        },
  );
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [refreshing, setRefreshing] = useState(false);

  const loadListings = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const result = await listingRepository.listActive();
    if (result.error) {
      setError(result.error);
    } else {
      setError(null);
      setListings(result.data);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  const showInitialLoading = loading && !refreshing && listings.length === 0 && !error;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ICEGEAR MARKET</Text>
          <Text style={styles.title}>Find winter gear</Text>
        </View>
        <Link href="/create" asChild>
          <Pressable accessibilityRole="button" style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Sell</Text>
          </Pressable>
        </Link>
      </View>

      {showInitialLoading ? (
        <View style={styles.state}>
          <ActivityIndicator />
          <Text style={styles.stateBody}>Loading active listings…</Text>
        </View>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void loadListings()} />
      ) : listings.length === 0 ? (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>No active listings yet</Text>
          <Text style={styles.stateBody}>New gear will appear here after it is published.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={listings}
          keyExtractor={(listing) => listing.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void loadListings(true)} />
          }
          renderItem={({ item }) => (
            <ListingCard listing={item} onPress={() => router.push(`/listing/${item.id}`)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f8fa' },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  eyebrow: { color: '#596273', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#18202b', fontSize: 24, fontWeight: '700', marginTop: 4 },
  primaryButton: {
    backgroundColor: '#18202b',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  listContent: { gap: 10, padding: 20, paddingTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 8, gap: 7, padding: 16 },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitle: { color: '#18202b', flex: 1, fontSize: 17, fontWeight: '700' },
  price: { color: '#18202b', fontSize: 15, fontWeight: '700' },
  meta: { color: '#596273', fontSize: 13, textTransform: 'capitalize' },
  location: { color: '#596273', fontSize: 13 },
  description: { color: '#303948', fontSize: 14, lineHeight: 20 },
  state: { alignItems: 'center', gap: 10, justifyContent: 'center', padding: 32 },
  stateTitle: { color: '#18202b', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  stateBody: { color: '#596273', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  secondaryButton: {
    borderColor: '#b7bec8',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  secondaryButtonText: { color: '#18202b', fontWeight: '600' },
});

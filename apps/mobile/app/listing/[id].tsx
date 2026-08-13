import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Listing } from '@icegear/domain';

import { listingRepository, type ListingRepositoryError } from '../../lib/listings/repository';
import { isSupabaseConfigured } from '../../lib/supabase/client';

function DetailValue({ value }: { value: unknown }) {
  if (typeof value === 'boolean')
    return <Text style={styles.detailValue}>{value ? 'Yes' : 'No'}</Text>;
  if (typeof value === 'number' || typeof value === 'string') {
    return <Text style={styles.detailValue}>{String(value)}</Text>;
  }

  return null;
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const listingId = Array.isArray(id) ? id[0] : id;
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<ListingRepositoryError | null>(() =>
    isSupabaseConfigured
      ? null
      : {
          code: 'not_configured',
          message: 'Connect Supabase to browse or publish marketplace listings.',
        },
  );
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!listingId) {
        setError({ code: 'not_found', message: 'Listing not found.' });
        setLoading(false);
        return;
      }

      const result = await listingRepository.getActiveById(listingId);
      if (!mounted) return;
      if (result.error) setError(result.error);
      else setListing(result.data);
      setLoading(false);
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [listingId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.state}>
          <ActivityIndicator />
          <Text style={styles.stateBody}>Loading listing…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !listing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.state}>
          <Text style={styles.stateTitle}>
            {error?.code === 'not_configured'
              ? 'Marketplace is not configured'
              : error?.code === 'not_found'
                ? 'Listing not found'
                : 'Could not load listing'}
          </Text>
          <Text style={styles.stateBody}>
            {error?.message ?? 'This listing is no longer available.'}
          </Text>
          <Link href="/" asChild>
            <Pressable accessibilityRole="button" style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Back to market</Text>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Link href="/" asChild>
          <Pressable accessibilityRole="button">
            <Text style={styles.backLink}>‹ Back to market</Text>
          </Pressable>
        </Link>
        <Text style={styles.eyebrow}>
          {listing.sport} · {listing.category}
        </Text>
        <Text style={styles.title}>{listing.title}</Text>
        <Text style={styles.price}>
          {listing.price.currency} {listing.price.amount.toLocaleString()}
        </Text>
        <Text style={styles.meta}>Condition: {listing.condition}</Text>
        {listing.location ? (
          <Text style={styles.meta}>Location: {String(listing.location)}</Text>
        ) : null}
        <Text style={styles.description}>{listing.description || 'No description provided.'}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Item details</Text>
          {Object.entries(listing.details).map(([key, value]) => (
            <View key={key} style={styles.detailRow}>
              <Text style={styles.detailKey}>{key}</Text>
              <DetailValue value={value} />
            </View>
          ))}
        </View>

        {listing.tags?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tags</Text>
            <Text style={styles.meta}>{listing.tags.join(', ')}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#f7f8fa', flex: 1 },
  content: { gap: 10, padding: 20 },
  backLink: { color: '#3d5a80', fontSize: 14, fontWeight: '600', marginBottom: 18 },
  eyebrow: { color: '#596273', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  title: { color: '#18202b', fontSize: 28, fontWeight: '700' },
  price: { color: '#18202b', fontSize: 20, fontWeight: '700' },
  meta: { color: '#596273', fontSize: 14 },
  description: { color: '#303948', fontSize: 16, lineHeight: 24, marginTop: 12 },
  section: { backgroundColor: '#fff', borderRadius: 8, gap: 10, marginTop: 18, padding: 16 },
  sectionTitle: { color: '#18202b', fontSize: 17, fontWeight: '700' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  detailKey: { color: '#596273', flex: 1, fontSize: 14 },
  detailValue: { color: '#18202b', flex: 1, fontSize: 14, textAlign: 'right' },
  state: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', padding: 32 },
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

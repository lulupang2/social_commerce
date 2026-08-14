import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import type { Listing } from '@icegear/domain';

import { listingRepository, type ListingRepositoryError } from '../../lib/listings/repository';
import { isSupabaseConfigured } from '../../lib/supabase/client';
import {
  categoryLabels,
  conditionLabels,
  formatLocation,
  formatPrice,
  sportLabels,
} from '../../lib/format';
import { colors, radii } from '../../lib/theme';
import { AppText as Text, fontFamilies } from '../../lib/typography';

function DetailValue({ value }: { value: unknown }) {
  if (typeof value === 'boolean')
    return <Text style={styles.detailValue}>{value ? '있음' : '없음'}</Text>;
  if (typeof value === 'number' || typeof value === 'string')
    return <Text style={styles.detailValue}>{String(value)}</Text>;
  return null;
}

export default function ListingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const listingId = Array.isArray(id) ? id[0] : id;
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<ListingRepositoryError | null>(() =>
    isSupabaseConfigured
      ? null
      : { code: 'not_configured', message: 'Supabase를 연결하면 상품을 확인할 수 있어요.' },
  );
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [imageFailed, setImageFailed] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!listingId) {
        setError({ code: 'not_found', message: '상품을 찾을 수 없어요.' });
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
      <StateScreen>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.stateText}>상품을 불러오는 중이에요.</Text>
      </StateScreen>
    );
  }

  if (error || !listing) {
    return (
      <StateScreen>
        <Text style={styles.stateEmoji}>🧤</Text>
        <Text style={styles.stateTitle}>
          {error?.code === 'not_configured' ? '마켓 연결이 필요해요' : '상품을 찾을 수 없어요'}
        </Text>
        <Text style={styles.stateText}>
          {error?.message ?? '상품이 삭제되었거나 판매 완료되었어요.'}
        </Text>
        <Pressable onPress={() => router.back()} style={styles.darkButton}>
          <Text style={styles.darkButtonText}>돌아가기</Text>
        </Pressable>
      </StateScreen>
    );
  }

  const image = listing.images[0];
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.navBar}>
          <Pressable
            accessibilityLabel="뒤로"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.navTitle}>상품 상세</Text>
          <Pressable
            accessibilityLabel={saved ? '찜 취소' : '찜하기'}
            onPress={() => setSaved((current) => !current)}
            style={styles.saveButton}
          >
            <Text style={[styles.saveText, saved ? styles.saveTextActive : null]}>
              {saved ? '♥' : '♡'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.imageWrap}>
          {image && !imageFailed ? (
            <Image
              accessibilityLabel={listing.title}
              onError={() => setImageFailed(true)}
              source={{ uri: image.url }}
              style={styles.image}
            />
          ) : (
            <View style={styles.imageFallback}>
              <Text style={styles.imageEmoji}>{listing.sport === 'ski' ? '⛷' : '🏒'}</Text>
              <Text style={styles.imageFallbackText}>{sportLabels[listing.sport]} 장비</Text>
            </View>
          )}
          <View style={styles.imageBadge}>
            <Text style={styles.imageBadgeText}>{sportLabels[listing.sport]}</Text>
          </View>
        </View>

        <View style={styles.authorRow}>
          <View style={styles.authorAvatar}>
            <Text style={styles.authorAvatarText}>I</Text>
          </View>
          <View style={styles.authorCopy}>
            <Text style={styles.authorName}>IceGear 판매자</Text>
            <Text style={styles.authorMeta}>안전한 거래를 위해 채팅으로 문의해주세요.</Text>
          </View>
        </View>
        <Text style={styles.title}>{listing.title}</Text>
        <Text style={styles.location}>{formatLocation(listing.location)} · 판매중</Text>
        <Text style={styles.price}>{formatPrice(listing)}</Text>
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>
              {categoryLabels[listing.category] ?? listing.category}
            </Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>
              {conditionLabels[listing.condition] ?? listing.condition}
            </Text>
          </View>
        </View>
        <Text style={styles.description}>{listing.description || '상품 설명이 아직 없어요.'}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>상품 정보</Text>
          {Object.entries(listing.details).map(([key, value]) => (
            <View key={key} style={styles.detailRow}>
              <Text style={styles.detailKey}>{key}</Text>
              <DetailValue value={value} />
            </View>
          ))}
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>등록일</Text>
            <Text style={styles.detailValue}>
              {new Intl.DateTimeFormat('ko-KR', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
              }).format(new Date(listing.createdAt))}
            </Text>
          </View>
        </View>

        <View style={styles.safetyCard}>
          <Text style={styles.safetyIcon}>✓</Text>
          <View style={styles.safetyCopy}>
            <Text style={styles.safetyTitle}>안전 거래 체크</Text>
            <Text style={styles.safetyText}>
              직거래는 사람이 많은 공공장소에서 진행하고, 외부 링크 결제를 요청받으면 신고해주세요.
            </Text>
          </View>
        </View>
      </ScrollView>
      <View style={styles.bottomBar}>
        <Pressable onPress={() => setSaved((current) => !current)} style={styles.bottomSave}>
          <Text style={[styles.bottomSaveText, saved ? styles.saveTextActive : null]}>
            {saved ? '♥' : '♡'}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.push('/chats')} style={styles.contactButton}>
          <Text style={styles.contactText}>채팅으로 문의하기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function StateScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.state}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: { paddingBottom: 110, paddingHorizontal: 18 },
  navBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 57,
  },
  backButton: { justifyContent: 'center', width: 40 },
  backIcon: { color: colors.ink, fontSize: 35, fontWeight: '300', lineHeight: 39 },
  navTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  saveButton: { alignItems: 'center', justifyContent: 'center', width: 40 },
  saveText: { color: colors.ink, fontSize: 25, lineHeight: 28 },
  saveTextActive: { color: colors.accent },
  imageWrap: { borderRadius: radii.md, height: 290, overflow: 'hidden', position: 'relative' },
  image: { backgroundColor: '#E7EDF2', height: '100%', width: '100%' },
  imageFallback: {
    alignItems: 'center',
    backgroundColor: '#E7EDF2',
    flex: 1,
    justifyContent: 'center',
  },
  imageEmoji: { fontSize: 70 },
  imageFallbackText: { color: colors.navy, fontSize: 13, fontWeight: '800', marginTop: 5 },
  imageBadge: {
    backgroundColor: 'rgba(32,33,36,0.78)',
    borderRadius: radii.pill,
    bottom: 13,
    left: 13,
    paddingHorizontal: 11,
    paddingVertical: 6,
    position: 'absolute',
  },
  imageBadgeText: { color: colors.surface, fontSize: 11, fontWeight: '800' },
  authorRow: { alignItems: 'center', flexDirection: 'row', marginTop: 19 },
  authorAvatar: {
    alignItems: 'center',
    backgroundColor: colors.navySoft,
    borderRadius: radii.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  authorAvatarText: { color: colors.navy, fontSize: 15, fontWeight: '900' },
  authorCopy: { marginLeft: 10 },
  authorName: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  authorMeta: { color: colors.subtle, fontSize: 11, marginTop: 3 },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.displayBold,
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 31,
    marginTop: 17,
  },
  location: { color: colors.muted, fontSize: 12, marginTop: 7 },
  price: {
    color: colors.ink,
    fontFamily: fontFamilies.accentBold,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: 0.2,
    marginTop: 12,
  },
  chipRow: { flexDirection: 'row', gap: 7, marginTop: 11 },
  chip: {
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  description: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 18 },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    gap: 12,
    marginTop: 23,
    padding: 16,
  },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', marginBottom: 2 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailKey: { color: colors.muted, flex: 1, fontSize: 12 },
  detailValue: { color: colors.ink, flex: 1, fontSize: 12, textAlign: 'right' },
  safetyCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.navySoft,
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: 9,
    marginTop: 14,
    padding: 13,
  },
  safetyIcon: {
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.pill,
    color: colors.surface,
    fontSize: 10,
    fontWeight: '800',
    height: 18,
    lineHeight: 18,
    textAlign: 'center',
    width: 18,
  },
  safetyCopy: { flex: 1 },
  safetyTitle: { color: colors.navy, fontSize: 12, fontWeight: '800' },
  safetyText: { color: colors.navy, fontSize: 11, lineHeight: 17, marginTop: 4 },
  bottomBar: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    padding: 12,
  },
  bottomSave: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    marginRight: 9,
    width: 51,
  },
  bottomSaveText: { color: colors.ink, fontSize: 23 },
  contactButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    flex: 1,
    height: 48,
    justifyContent: 'center',
  },
  contactText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 30 },
  stateEmoji: { fontSize: 40, marginBottom: 13 },
  stateTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  stateText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
    textAlign: 'center',
  },
  darkButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    marginTop: 19,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  darkButtonText: { color: colors.surface, fontSize: 13, fontWeight: '800' },
});

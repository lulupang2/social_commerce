import type { Listing } from '@icegear/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  ListingDetailGallery,
  ListingDetailSellerCard,
  ListingDetailStickyCta,
} from '../../components/listing-detail';
import { ListingAttributeGrid } from '../../components/listings/ListingAttributeGrid';
import { RecommendationReason } from '../../components/listings/RecommendationReason';
import { AppIcon, Chip, StateView } from '../../components/ui';
import { useSession } from '../../lib/auth/session';
import { chatRepository } from '../../lib/chat/repository';
import { favoritesRepository } from '../../lib/favorites/repository';
import {
  categoryLabels,
  conditionLabels,
  formatLocation,
  formatPrice,
  formatTime,
  statusLabels,
} from '../../lib/format';
import { listingRepository, type ListingRepositoryError } from '../../lib/listings/repository';
import { isSupabaseConfigured } from '../../lib/supabase/client';
import { colors, radii, spacing } from '../../lib/theme';
import { AppText as Text, fontFamilies } from '../../lib/typography';

import { moderationRepository } from '../../lib/moderation';
function DetailValue({ value }: { value: unknown }) {
  if (typeof value === 'boolean')
    return <Text style={styles.detailValue}>{value ? '있음' : '없음'}</Text>;
  if (typeof value === 'number' || typeof value === 'string')
    return <Text style={styles.detailValue}>{String(value)}</Text>;
  return null;
}

export default function ListingDetailScreen() {
  const router = useRouter();
  const session = useSession();
  const { id, recommendationReason } = useLocalSearchParams<{
    id: string | string[];
    recommendationReason?: string | string[];
  }>();

  const reason = Array.isArray(recommendationReason)
    ? recommendationReason[0]
    : recommendationReason;
  const listingId = Array.isArray(id) ? id[0] : id;

  const isAuthenticated = session.state.status === 'authenticated';
  const currentUserId =
    session.state.status === 'authenticated' ? session.state.user.id : undefined;

  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<ListingRepositoryError | null>(() =>
    isSupabaseConfigured
      ? null
      : { code: 'not_configured', message: 'Supabase를 연결하면 상품을 확인할 수 있어요.' },
  );
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSellerBlocked, setIsSellerBlocked] = useState(false);

  const loadListingAndFavorite = useCallback(async () => {
    if (!listingId) {
      setError({ code: 'not_found', message: '상품을 찾을 수 없어요.' });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await listingRepository.getActiveById(listingId);
    if (result.error) {
      setError(result.error);
      setListing(null);
      setLoading(false);
      return;
    }

    setListing(result.data);

    if (result.data && isAuthenticated) {
      const favResult = await favoritesRepository.isFavorite(listingId);
      if (favResult.data !== null) {
        setIsFavorite(favResult.data);
      }
    }
    const blockedRes = await moderationRepository.isUserBlocked(result.data.sellerId);
    if (blockedRes.data !== null) {
      setIsSellerBlocked(Boolean(blockedRes.data));
    }

    setLoading(false);
  }, [listingId, isAuthenticated]);

  useEffect(() => {
    void loadListingAndFavorite();
  }, [loadListingAndFavorite]);

  const handleToggleFavorite = async () => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    if (!listing || isFavoriteLoading) return;

    const previousValue = isFavorite;
    setIsFavorite(!previousValue);
    setIsFavoriteLoading(true);

    const result = await favoritesRepository.toggle(listing.id);
    setIsFavoriteLoading(false);

    if (result.error) {
      // Optimistic rollback
      setIsFavorite(previousValue);
    } else if (result.data) {
      setIsFavorite(result.data.isFavorite);
    }
  };

  const handleStartChat = async () => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    if (!listing || isChatLoading) return;

    const isOwnListing = currentUserId === listing.sellerId;
    if (isOwnListing || listing.status === 'sold' || listing.status === 'removed') {
      return;
    }

    setIsChatLoading(true);
    setChatError(null);

    const result = await chatRepository.findOrCreateConversation(listing.id, listing.sellerId);
    setIsChatLoading(false);

    if (result.data?.id) {
      router.push(`/chat/${result.data.id}`);
    } else if (result.error) {
      setChatError(result.error.message || '채팅방을 생성하는데 실패했어요.');
    }
  };
  const handleReportSeller = () => {
    if (!listing) return;
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }
    Alert.alert('상품/판매자 신고', '이 게시글을 신고하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '신고 접수',
        style: 'destructive',
        onPress: async () => {
          const res = await moderationRepository.submitReport({
            targetType: 'listing',
            targetId: listing.id,
            reason: 'other',
          });
          if (res.error) {
            Alert.alert('신고 실패', res.error.message);
          } else {
            Alert.alert('신고 완료', '신고가 접수되었습니다. 검토 후 처리됩니다.');
          }
        },
      },
    ]);
  };

  const handleToggleBlockSeller = () => {
    if (!listing) return;
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }
    const willBlock = !isSellerBlocked;
    Alert.alert(
      willBlock ? '판매자 차단' : '차단 해제',
      willBlock
        ? '이 판매자를 차단하시겠습니까? 차단 시 해당 사용자의 콘텐츠가 제한됩니다.'
        : '차단을 해제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: willBlock ? '차단' : '해제',
          style: willBlock ? 'destructive' : 'default',
          onPress: async () => {
            if (willBlock) {
              const res = await moderationRepository.blockUser(listing.sellerId);
              if (res.error) {
                Alert.alert('차단 실패', res.error.message);
              } else {
                setIsSellerBlocked(true);
                Alert.alert('차단 완료', '판매자가 차단되었습니다.');
              }
            } else {
              const res = await moderationRepository.unblockUser(listing.sellerId);
              if (res.error) {
                Alert.alert('차단 해제 실패', res.error.message);
              } else {
                setIsSellerBlocked(false);
                Alert.alert('차단 해제 완료', '차단이 해제되었습니다.');
              }
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StateView kind="loading" title="상품을 불러오는 중이에요" />
      </SafeAreaView>
    );
  }

  const isRemoved = listing?.status === 'removed';
  if (error || !listing || isRemoved) {
    const isNotConfigured = error?.code === 'not_configured';
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.navBar}>
          <Pressable
            accessibilityLabel="뒤로"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <AppIcon color={colors.text} name="back" size={24} />
          </Pressable>
          <Text style={styles.navTitle} variant="bodyStrong">
            상품 상세
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <StateView
          actionLabel="돌아가기"
          icon={isNotConfigured ? 'warning' : 'image'}
          kind="error"
          message={
            error?.message ??
            (isRemoved
              ? '판매자에 의해 삭제된 상품이에요.'
              : '상품이 존재하지 않거나 정보를 불러올 수 없어요.')
          }
          onAction={() => router.back()}
          title={isNotConfigured ? '마켓 연결이 필요해요' : '상품을 찾을 수 없어요'}
        />
      </SafeAreaView>
    );
  }

  const isOwnListing = Boolean(currentUserId && currentUserId === listing.sellerId);
  const formattedPrice = formatPrice(listing);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.navBar}>
          <Pressable
            accessibilityLabel="뒤로"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <AppIcon color={colors.text} name="back" size={24} />
          </Pressable>
          <Text style={styles.navTitle} variant="bodyStrong">
            상품 상세
          </Text>
          <Pressable
            accessibilityLabel={isFavorite ? '찜 취소' : '찜하기'}
            accessibilityRole="button"
            accessibilityState={{ checked: isFavorite }}
            onPress={handleToggleFavorite}
            style={styles.saveHeaderButton}
          >
            <Text style={[styles.saveHeaderText, isFavorite && styles.saveTextActive]}>
              {isFavorite ? '♥' : '♡'}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Image Gallery */}
          <ListingDetailGallery
            images={listing.images}
            sport={listing.sport}
            status={listing.status}
            title={listing.title}
          />

          {/* Seller Projection */}
          <View style={styles.sectionSpacing}>
            <ListingDetailSellerCard
              isBlocked={isSellerBlocked}
              isOwnListing={isOwnListing}
              onBlockSeller={handleToggleBlockSeller}
              onReportSeller={handleReportSeller}
              sellerId={listing.sellerId}
            />
          </View>

          {/* Optional Recommendation Reason */}
          {reason ? (
            <View style={styles.sectionSpacing}>
              <RecommendationReason reason={reason} />
            </View>
          ) : null}

          {/* Title & Metadata */}
          <View style={styles.headerSection}>
            <Text style={styles.title} variant="title">
              {listing.title}
            </Text>

            <View style={styles.metaRow}>
              <Text style={styles.locationText} variant="caption">
                {formatLocation(listing.location)}
              </Text>
              <Text style={styles.metaDot} variant="caption">
                ·
              </Text>
              <Text style={styles.timeText} variant="caption">
                {formatTime(listing.createdAt)}
              </Text>
              <Text style={styles.metaDot} variant="caption">
                ·
              </Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText} variant="caption">
                  {statusLabels[listing.status]}
                </Text>
              </View>
            </View>

            <Text style={styles.price} variant="headline">
              {formattedPrice}
            </Text>

            <View style={styles.chipRow}>
              <Chip label={categoryLabels[listing.category] ?? listing.category} />
              <Chip label={conditionLabels[listing.condition] ?? listing.condition} />
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle} variant="bodyStrong">
              상품 설명
            </Text>
            <Text style={styles.description} variant="body">
              {listing.description || '상품 설명이 아직 없어요.'}
            </Text>
          </View>

          {/* Ski / Hockey Attribute Grid */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle} variant="bodyStrong">
              장비 상세 정보
            </Text>
            <ListingAttributeGrid listing={listing} />
          </View>

          {/* Key-Value Details */}
          {Object.keys(listing.details).length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} variant="bodyStrong">
                추가 속성
              </Text>
              {Object.entries(listing.details).map(([key, value]) => (
                <View key={key} style={styles.detailRow}>
                  <Text style={styles.detailKey} variant="caption">
                    {key}
                  </Text>
                  <DetailValue value={value} />
                </View>
              ))}
            </View>
          ) : null}

          {/* Safety Notice Card */}
          <View style={styles.safetyCard}>
            <View style={styles.safetyIconBadge}>
              <AppIcon color={colors.info} name="check" size={14} />
            </View>
            <View style={styles.safetyCopy}>
              <Text style={styles.safetyTitle} variant="bodyStrong">
                안전 거래 체크
              </Text>
              <Text style={styles.safetyText} variant="caption">
                직거래는 사람이 많은 공공장소에서 진행하고, 외부 링크 결제를 요청받으면
                신고해주세요.
              </Text>
            </View>
          </View>

          {/* Chat Error Notice */}
          {chatError ? (
            <View style={styles.chatErrorCard}>
              <AppIcon color={colors.error} name="warning" size={16} />
              <Text style={styles.chatErrorText} variant="caption">
                {chatError}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Sticky Favorite & Chat CTA */}
        <ListingDetailStickyCta
          isChatLoading={isChatLoading}
          isFavorite={isFavorite}
          isFavoriteLoading={isFavoriteLoading}
          isOwnListing={isOwnListing}
          onStartChat={handleStartChat}
          onToggleFavorite={handleToggleFavorite}
          priceText={formattedPrice}
          status={listing.status}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  navBar: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: 52,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  backButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  navTitle: {
    color: colors.text,
  },
  saveHeaderButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  saveHeaderText: {
    color: colors.text,
    fontSize: 22,
  },
  saveTextActive: {
    color: colors.accent,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    gap: spacing.md,
    paddingBottom: 110,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sectionSpacing: {
    marginTop: spacing.xs,
  },
  headerSection: {
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontFamily: fontFamilies.displayBold,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  locationText: {
    color: colors.textMuted,
  },
  metaDot: {
    color: colors.textSubtle,
  },
  timeText: {
    color: colors.textMuted,
  },
  statusBadge: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  statusBadgeText: {
    color: colors.text,
  },
  price: {
    color: colors.text,
    fontFamily: fontFamilies.accentBold,
    marginTop: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
  },
  description: {
    color: colors.textMuted,
    lineHeight: 22,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  detailKey: {
    color: colors.textMuted,
    flex: 1,
  },
  detailValue: {
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  safetyCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.infoSoft,
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  safetyIconBadge: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    height: 20,
    justifyContent: 'center',
    marginTop: 2,
    width: 20,
  },
  safetyCopy: {
    flex: 1,
  },
  safetyTitle: {
    color: colors.info,
  },
  safetyText: {
    color: colors.info,
    lineHeight: 18,
    marginTop: 2,
  },
  chatErrorCard: {
    alignItems: 'center',
    backgroundColor: colors.errorSoft,
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  chatErrorText: {
    color: colors.error,
  },
});

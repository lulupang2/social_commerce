import type { Listing } from '@icegear/domain';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii } from '../../lib/theme';
import { AppText as Text } from '../../lib/typography';

interface SuccessSectionProps {
  listing: Listing | null;
  onReset: () => void;
  onGoHome: () => void;
}

export function SuccessSection({ listing, onReset, onGoHome }: SuccessSectionProps) {
  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>DRAFT / 검토 요청 완료</Text>
      </View>

      <Text style={styles.icon}>🎉</Text>
      <Text style={styles.title}>판매글 등록 완료!</Text>
      <Text style={styles.body}>
        작성하신 판매글이 검토 요청(임시저장) 상태로 안전하게 저장되었습니다. 검토 후 피드에 게시될
        예정입니다.
      </Text>

      {listing ? (
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>등록된 상품 정보</Text>
          <Text style={styles.cardTitle}>{listing.title}</Text>
          <Text style={styles.cardPrice}>
            {listing.price.amount.toLocaleString()} {listing.price.currency}
          </Text>
          <Text style={styles.cardMeta}>
            종목: {listing.sport === 'ski' ? '스키' : '하키'} · 카테고리: {listing.category}
          </Text>
          <Text style={styles.cardId}>Listing ID: {listing.id}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="새 판매글 추가 작성하기"
          onPress={onReset}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>+ 새 판매글 작성하기</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="마켓 홈으로 이동"
          onPress={onGoHome}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>‹ 마켓 홈으로 이동</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 14, paddingVertical: 20 },
  badge: {
    backgroundColor: colors.accentSoft,
    borderColor: '#FFD4C8',
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  icon: { fontSize: 44, marginVertical: 4 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  body: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 10,
    textAlign: 'center',
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: 4,
    marginVertical: 6,
    padding: 16,
  },
  cardEyebrow: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  cardPrice: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  cardMeta: { color: colors.muted, fontSize: 12 },
  cardId: { color: colors.muted, fontSize: 10, marginTop: 4 },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 10 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  secondaryButtonText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
});

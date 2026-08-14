import type { CurrentProfile, ProfileActivityStatistics } from '../../lib/profile/repository';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, interaction, radii, spacing } from '../../lib/theme';
import { AppText as Text, fontFamilies } from '../../lib/typography';
import { AppIcon, type AppIconName, Avatar, Button } from '../ui';

export interface ProfileHeroProps {
  profile: CurrentProfile;
  email?: string;
  onEdit(): void;
}

export function ProfileHero({ profile, email, onEdit }: ProfileHeroProps) {
  const name = profile.displayName || profile.username || email || 'IceGear 멤버';
  const sportNames = profile.sports
    .map((preference) =>
      preference.sport === 'ski' ? '스키' : preference.sport === 'hockey' ? '아이스하키' : null,
    )
    .filter((value) => value !== null);

  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <Avatar imageUrl={profile.avatarUrl} name={name} size={64} />
        <View style={styles.heroIdentity}>
          <Text style={styles.heroKicker}>MY GEAR LOCKER</Text>
          <Text numberOfLines={2} style={styles.heroName}>
            {name}
          </Text>
          {profile.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
        </View>
      </View>
      {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
      <View style={styles.sportTags}>
        {sportNames.length > 0 ? (
          sportNames.map((label) => (
            <View key={label} style={styles.sportTag}>
              <Text style={styles.sportTagText}>{label}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.missingPreference}>선호 스포츠가 아직 없어요.</Text>
        )}
      </View>
      <Button fullWidth label="프로필 수정" onPress={onEdit} variant="secondary" />
    </View>
  );
}

export interface ProfileActivityProps {
  statistics: ProfileActivityStatistics | null;
  loading: boolean;
  error: string | null;
  onRetry(): void;
  onFavorites(): void;
  onSelling(): void;
  onCommunity(): void;
}

function ActivityRow({
  icon,
  label,
  detail,
  description,
  onPress,
}: {
  icon: AppIconName;
  label: string;
  detail?: string;
  description: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}${detail ? `, ${detail}` : ''}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.activityRow, pressed && styles.pressed]}
    >
      <View style={styles.activityIcon}>
        <AppIcon color={colors.primary} name={icon} size={20} />
      </View>
      <View style={styles.activityCopy}>
        <Text style={styles.activityLabel}>{label}</Text>
        <Text style={styles.activityDescription}>{description}</Text>
      </View>
      {detail ? <Text style={styles.activityDetail}>{detail}</Text> : null}
      <AppIcon color={colors.textSubtle} name="chevronRight" size={18} />
    </Pressable>
  );
}

export function ProfileActivity({
  statistics,
  loading,
  error,
  onRetry,
  onFavorites,
  onSelling,
  onCommunity,
}: ProfileActivityProps) {
  const listingDetail = statistics
    ? `${statistics.listings.activeCount} 판매중 · ${statistics.listings.draftCount + statistics.listings.pendingReviewCount} 준비중`
    : undefined;
  const communityDetail = statistics
    ? `${statistics.community.publishedPostCount} 공개 · ${statistics.community.draftPostCount} 임시저장`
    : undefined;

  return (
    <View style={styles.activitySection}>
      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionKicker}>ACCOUNT RECORDS</Text>
          <Text style={styles.sectionTitle}>나의 활동</Text>
        </View>
        {loading ? <Text style={styles.loadingLabel}>불러오는 중</Text> : null}
      </View>

      {error ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={styles.activityError}
        >
          <View style={styles.errorCopy}>
            <Text style={styles.errorTitle}>활동 수치를 불러오지 못했어요</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </View>
          <Pressable
            accessibilityLabel="활동 수치 다시 불러오기"
            onPress={onRetry}
            style={styles.retryButton}
          >
            <AppIcon color={colors.error} name="refresh" size={20} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.activityCard}>
        <ActivityRow
          description="내가 저장한 장비 모음"
          detail={statistics ? `${statistics.favorites.listingCount}` : undefined}
          icon="heart"
          label="찜한 상품"
          onPress={onFavorites}
        />
        <ActivityRow
          description="판매글 작성과 관리"
          detail={listingDetail}
          icon="add"
          label="내가 올린 상품"
          onPress={onSelling}
        />
        <ActivityRow
          description="공개 글과 임시저장 글"
          detail={communityDetail}
          icon="community"
          label="내 커뮤니티 글"
          onPress={onCommunity}
        />
      </View>

      {statistics ? (
        <View style={styles.auditCard}>
          <AppIcon color={colors.info} name="info" size={18} />
          <View style={styles.auditCopy}>
            <Text style={styles.auditTitle}>내 계정에 저장된 기록만 집계해요</Text>
            <Text style={styles.auditBody}>
              좋아요 {statistics.community.likesGivenCount}개 ·{' '}
              {new Date(statistics.asOf).toLocaleDateString('ko-KR')} 기준
            </Text>
            <Text style={styles.auditBody}>
              완료 거래와 탄소 절감량은 감사 가능한 기록이 없어 표시하지 않아요.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export interface ProfileAccountActionsProps {
  anonymous: boolean;
  signingOut: boolean;
  error: string | null;
  onSignOut(): void;
  onSafetySettings?: () => void;
}
export function ProfileAccountActions({
  anonymous,
  signingOut,
  error,
  onSignOut,
  onSafetySettings,
}: ProfileAccountActionsProps) {
  return (
    <View style={styles.accountSection}>
      {anonymous ? (
        <View style={styles.developmentBadge}>
          <Text style={styles.developmentBadgeText}>개발용 익명 세션</Text>
        </View>
      ) : null}
      {onSafetySettings ? (
        <Button
          fullWidth
          label="안전 및 차단 관리"
          onPress={onSafetySettings}
          variant="secondary"
        />
      ) : null}
      {error ? (
        <Text
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={styles.signOutError}
        >
          {error}
        </Text>
      ) : null}
      <Button fullWidth label="로그아웃" loading={signingOut} onPress={onSignOut} variant="ghost" />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radii.lg,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  heroTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.lg },
  heroIdentity: { flex: 1 },
  heroKicker: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 12,
    letterSpacing: 1.4,
  },
  heroName: {
    color: colors.textInverse,
    fontFamily: fontFamilies.displayBold,
    fontSize: 24,
    lineHeight: 30,
    marginTop: spacing.xs,
  },
  username: { color: colors.textSubtle, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  bio: { color: colors.surfaceSubtle, fontSize: 14, lineHeight: 21 },
  sportTags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sportTag: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sportTagText: { color: colors.accentPressed, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  missingPreference: { color: colors.textSubtle, fontSize: 13, lineHeight: 19 },
  activitySection: { gap: spacing.md },
  sectionHeading: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  sectionKicker: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fontFamilies.displayBold,
    fontSize: 22,
    lineHeight: 28,
    marginTop: spacing.xs,
  },
  loadingLabel: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  activityCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  activityRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: { backgroundColor: colors.surfaceSubtle },
  activityIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    height: interaction.minimumTarget,
    justifyContent: 'center',
    width: interaction.minimumTarget,
  },
  activityCopy: { flex: 1 },
  activityLabel: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  activityDescription: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  activityDetail: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 116,
    textAlign: 'right',
  },
  activityError: {
    alignItems: 'center',
    backgroundColor: colors.errorSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorCopy: { flex: 1 },
  errorTitle: { color: colors.error, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  errorBody: { color: colors.error, fontSize: 12, lineHeight: 18, marginTop: spacing.xs },
  retryButton: {
    alignItems: 'center',
    height: interaction.minimumTarget,
    justifyContent: 'center',
    width: interaction.minimumTarget,
  },
  auditCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.infoSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  auditCopy: { flex: 1, gap: spacing.xs },
  auditTitle: { color: colors.info, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  auditBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  accountSection: { gap: spacing.md },
  developmentBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.warningSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  developmentBadgeText: { color: colors.warning, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  signOutError: { color: colors.error, fontSize: 13, lineHeight: 19 },
});

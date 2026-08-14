import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ProfileAccountActions,
  ProfileActivity,
  ProfileEditor,
  ProfileHero,
} from '../../components/profile';
import { AppIcon, Button, StateView } from '../../components/ui';
import { signOut as signOutSession, useSession } from '../../lib/auth';
import {
  getCurrentProfile,
  getCurrentProfileActivityStatistics,
  type CurrentProfile,
  type ProfileActivityStatistics,
} from '../../lib/profile/repository';
import { colors, radii, spacing } from '../../lib/theme';
import { AppText as Text, fontFamilies } from '../../lib/typography';
import { moderationRepository } from '../../lib/moderation';

export default function ProfileScreen() {
  const router = useRouter();
  const { state: sessionState, refresh: refreshSession } = useSession();
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [statistics, setStatistics] = useState<ProfileActivityStatistics | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [statisticsLoading, setStatisticsLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [statisticsError, setStatisticsError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const loadAccount = useCallback(async () => {
    if (sessionState.status !== 'authenticated') {
      setProfile(null);
      setStatistics(null);
      setProfileError(null);
      setStatisticsError(null);
      return;
    }

    setProfileLoading(true);
    setStatisticsLoading(true);
    setProfileError(null);
    setStatisticsError(null);
    const [profileResult, statisticsResult] = await Promise.all([
      getCurrentProfile(),
      getCurrentProfileActivityStatistics(),
    ]);
    setProfileLoading(false);
    setStatisticsLoading(false);

    if (profileResult.error) {
      setProfile(null);
      setProfileError(profileResult.error.message);
    } else {
      setProfile(profileResult.data);
    }

    if (statisticsResult.error) {
      setStatistics(null);
      setStatisticsError(statisticsResult.error.message);
    } else {
      setStatistics(statisticsResult.data);
    }
  }, [sessionState.status]);

  const reloadStatistics = useCallback(async () => {
    if (sessionState.status !== 'authenticated') return;
    setStatisticsLoading(true);
    setStatisticsError(null);
    const result = await getCurrentProfileActivityStatistics();
    setStatisticsLoading(false);
    if (result.error) {
      setStatistics(null);
      setStatisticsError(result.error.message);
      return;
    }
    setStatistics(result.data);
  }, [sessionState.status]);

  useFocusEffect(
    useCallback(() => {
      void loadAccount();
    }, [loadAccount]),
  );

  async function signOut() {
    setSignOutError(null);
    setSigningOut(true);
    const result = await signOutSession('local');
    if (!result.error) await refreshSession();
    setSigningOut(false);
    if (result.error) {
      setSignOutError(result.error.message);
      return;
    }
    setEditing(false);
    setProfile(null);
    setStatistics(null);
  }
  const handleSafetySettings = async () => {
    const blockedRes = await moderationRepository.getBlockedUserIds();
    const count = blockedRes.data ? blockedRes.data.size : 0;
    Alert.alert(
      '안전 및 차단 관리',
      `현재 차단한 사용자: ${count}명\n\nIceGear는 쾌적하고 안전한 스포츠 용품 거래 환경을 위해 차단 및 신고 기능을 제공합니다.`,
      [{ text: '확인', style: 'default' }],
    );
  };

  const authenticated = sessionState.status === 'authenticated' ? sessionState : null;
  const onboardingRequired = profile?.onboardingState === 'required';

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            authenticated ? (
              <RefreshControl
                accessibilityLabel="프로필 새로고침"
                onRefresh={() => void loadAccount()}
                refreshing={profileLoading && profile !== null}
                tintColor={colors.accent}
              />
            ) : undefined
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>MY ICEGEAR</Text>
              <Text style={styles.title}>나의 장비함</Text>
            </View>
            <View style={styles.headerMark} accessible accessibilityLabel="IceGear 프로필">
              <Text style={styles.headerMarkText}>IG</Text>
            </View>
          </View>

          {sessionState.status === 'loading' || sessionState.status === 'callback' ? (
            <StateView
              kind="loading"
              message={
                sessionState.status === 'callback'
                  ? '이메일 링크의 로그인 정보를 확인하고 있어요.'
                  : '저장된 계정을 확인하고 있어요.'
              }
              title="프로필을 준비하는 중"
            />
          ) : null}

          {sessionState.status === 'error' ? (
            <StateView
              actionLabel={sessionState.error.recoverable ? '다시 확인' : undefined}
              kind="error"
              message={sessionState.error.message}
              onAction={
                sessionState.error.recoverable
                  ? () => {
                      void refreshSession();
                    }
                  : undefined
              }
              title="로그인 상태를 확인하지 못했어요"
            />
          ) : null}

          {sessionState.status === 'unauthenticated' ? (
            <View style={styles.guestCard}>
              <View style={styles.guestIcon}>
                <AppIcon color={colors.accent} name="profile" size={30} />
              </View>
              <Text style={styles.guestKicker}>YOUR LOCKER STARTS HERE</Text>
              <Text style={styles.guestTitle}>로그인하고 내 장비 기록을 모아보세요</Text>
              <Text style={styles.guestBody}>
                찜한 상품, 판매글, 커뮤니티 활동은 확인된 계정의 실제 기록만 보여드려요.
              </Text>
              <Button
                fullWidth
                label="이메일로 로그인"
                onPress={() => router.push('/auth')}
                size="large"
                variant="accent"
              />
            </View>
          ) : null}

          {authenticated && profileLoading && !profile ? (
            <StateView
              kind="loading"
              message="프로필과 선호 장비를 불러오고 있어요."
              title="내 장비함을 여는 중"
            />
          ) : null}

          {authenticated && profileError && !profile ? (
            <StateView
              actionLabel="다시 불러오기"
              kind="error"
              message={profileError}
              onAction={() => void loadAccount()}
              title="프로필을 불러오지 못했어요"
            />
          ) : null}

          {authenticated && profile && (onboardingRequired || editing) ? (
            <>
              {onboardingRequired ? (
                <View style={styles.requiredBanner}>
                  <AppIcon color={colors.warning} name="warning" size={20} />
                  <View style={styles.requiredCopy}>
                    <Text style={styles.requiredTitle}>프로필 설정이 아직 끝나지 않았어요</Text>
                    <Text style={styles.requiredBody}>
                      이름과 선호 스포츠를 저장하면 활동 화면을 열 수 있어요.
                    </Text>
                  </View>
                </View>
              ) : null}
              <ProfileEditor
                mode={onboardingRequired ? 'onboarding' : 'edit'}
                onCancel={onboardingRequired ? undefined : () => setEditing(false)}
                onSaved={(savedProfile) => {
                  setProfile(savedProfile);
                  setEditing(false);
                  void reloadStatistics();
                }}
                profile={profile}
              />
            </>
          ) : null}

          {authenticated && profile && !onboardingRequired && !editing ? (
            <>
              <ProfileHero
                email={authenticated.user.email}
                onEdit={() => setEditing(true)}
                profile={profile}
              />
              <ProfileActivity
                error={statisticsError}
                loading={statisticsLoading}
                onCommunity={() => router.push('/(tabs)/community')}
                onFavorites={() => router.push('/(tabs)')}
                onRetry={() => void reloadStatistics()}
                onSelling={() => router.push('/(tabs)/sell')}
                statistics={statistics}
              />
              <ProfileAccountActions
                anonymous={authenticated.isAnonymous}
                error={signOutError}
                onSafetySettings={() => void handleSafetySettings()}
                onSignOut={() => void signOut()}
                signingOut={signingOut}
              />
            </>
          ) : null}

          <Text style={styles.version}>IceGear · 계정 데이터 기준</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  keyboardView: { flex: 1 },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing.xxl,
    maxWidth: 720,
    paddingBottom: 112,
    paddingHorizontal: spacing.page,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  title: {
    color: colors.text,
    fontFamily: fontFamilies.displayExtraBold,
    fontSize: 29,
    lineHeight: 36,
    marginTop: spacing.xs,
  },
  headerMark: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  headerMarkText: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  guestCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceStrong,
    borderRadius: radii.lg,
    gap: spacing.md,
    padding: spacing.xxl,
  },
  guestIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  guestKicker: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 12,
    letterSpacing: 1.4,
    marginTop: spacing.sm,
  },
  guestTitle: {
    color: colors.textInverse,
    fontFamily: fontFamilies.displayBold,
    fontSize: 24,
    lineHeight: 31,
    textAlign: 'center',
  },
  guestBody: { color: colors.textSubtle, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  requiredBanner: {
    alignItems: 'flex-start',
    backgroundColor: colors.warningSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  requiredCopy: { flex: 1 },
  requiredTitle: { color: colors.warning, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  requiredBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.xs },
  version: { color: colors.textSubtle, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});

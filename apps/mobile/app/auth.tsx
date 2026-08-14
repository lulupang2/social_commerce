import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, Button } from '../components/ui';
import {
  requestEmailOtp,
  signInAnonymouslyForDemo,
  signOut as signOutSession,
  useSession,
  verifyEmailOtp,
} from '../lib/auth';
import { isDemoAnonymousAuthEnabled, isSupabaseConfigured } from '../lib/supabase/client';
import { colors, interaction, radii, spacing } from '../lib/theme';
import { AppText as Text, AppTextInput as TextInput, fontFamilies } from '../lib/typography';

type AuthStep = 'email' | 'code';

export default function AuthScreen() {
  const router = useRouter();
  const { state, refresh, clearError } = useSession();
  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function requestCode() {
    setError(null);
    setNotice(null);
    setWorking(true);
    const result = await requestEmailOtp({ email });
    setWorking(false);
    if (result.error) {
      setError(result.error.fieldErrors?.email ?? result.error.message);
      return;
    }

    setEmail(result.data.email);
    setStep('code');
    setNotice(`${result.data.email}로 로그인 코드와 링크를 보냈어요.`);
  }

  async function verifyCode() {
    setError(null);
    setNotice(null);
    setWorking(true);
    const result = await verifyEmailOtp({ email, token });
    if (!result.error) await refresh();
    setWorking(false);
    if (result.error) {
      setError(result.error.fieldErrors?.token ?? result.error.message);
      return;
    }
    setNotice('이메일 확인을 마쳤어요.');
  }

  async function resendCode() {
    setToken('');
    setError(null);
    setNotice(null);
    setWorking(true);
    const result = await requestEmailOtp({ email });
    setWorking(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setNotice('새 로그인 코드를 보냈어요. 가장 최근 메일을 확인해 주세요.');
  }

  function cancelVerification() {
    setStep('email');
    setToken('');
    setError(null);
    setNotice(null);
  }

  async function enterDevelopmentSession() {
    setError(null);
    setNotice(null);
    setWorking(true);
    const result = await signInAnonymouslyForDemo();
    if (!result.error) await refresh();
    setWorking(false);
    if (result.error) setError(result.error.message);
  }

  async function signOut() {
    setError(null);
    setNotice(null);
    setWorking(true);
    const result = await signOutSession('local');
    if (!result.error) await refresh();
    setWorking(false);
    if (result.error) setError(result.error.message);
  }

  async function retrySession() {
    setError(null);
    setNotice(null);
    setStep('email');
    setToken('');
    await clearError();
  }

  const authenticatedEmail =
    state.status === 'authenticated' ? (state.user.email ?? '이메일이 확인된 계정') : null;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            accessibilityLabel="로그인 화면 닫기"
            accessibilityRole="button"
            hitSlop={4}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <AppIcon color={colors.text} name="close" size={20} />
          </Pressable>

          <View style={styles.brandMark} accessible accessibilityLabel="IceGear">
            <Text style={styles.brandLetter}>I</Text>
            <View style={styles.brandStripe} />
          </View>
          <Text style={styles.eyebrow}>ICEGEAR MEMBER ACCESS</Text>
          <Text style={styles.title}>내 장비함으로{`\n`}돌아오세요.</Text>
          <Text style={styles.body}>
            이메일로 받은 코드나 링크를 확인하면 찜, 판매글, 커뮤니티 활동을 이어갈 수 있어요.
          </Text>

          {state.status === 'loading' ? (
            <View accessibilityLiveRegion="polite" style={styles.stateCard}>
              <View style={styles.stateIcon}>
                <AppIcon color={colors.accent} name="refresh" size={26} />
              </View>
              <Text style={styles.stateTitle}>저장된 로그인을 확인하고 있어요</Text>
              <Text style={styles.stateBody}>잠시만 기다려 주세요.</Text>
            </View>
          ) : null}

          {state.status === 'callback' ? (
            <View accessibilityLiveRegion="polite" style={styles.stateCard}>
              <View style={styles.stateIcon}>
                <AppIcon color={colors.info} name="check" size={26} />
              </View>
              <Text style={styles.stateTitle}>이메일 링크를 확인하고 있어요</Text>
              <Text style={styles.stateBody}>
                확인이 끝나면 이 화면에서 바로 로그인 상태를 알려드려요.
              </Text>
              <Button fullWidth label="닫기" onPress={() => router.back()} variant="ghost" />
            </View>
          ) : null}

          {state.status === 'error' ? (
            <View
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={styles.errorState}
            >
              <View style={styles.errorStateIcon}>
                <AppIcon color={colors.error} name="warning" size={26} />
              </View>
              <Text style={styles.stateTitle}>
                {state.error.code === 'not_configured'
                  ? '이 빌드에서는 로그인을 사용할 수 없어요'
                  : '로그인을 확인하지 못했어요'}
              </Text>
              <Text style={styles.stateBody}>{state.error.message}</Text>
              {state.error.recoverable ? (
                <Button
                  fullWidth
                  label="다시 확인"
                  leadingIcon="refresh"
                  onPress={() => void retrySession()}
                  variant="secondary"
                />
              ) : null}
            </View>
          ) : null}

          {state.status === 'authenticated' ? (
            <View style={styles.signedInCard}>
              <View style={styles.successIcon}>
                <AppIcon color={colors.success} name="check" size={28} />
              </View>
              <Text style={styles.stateTitle}>로그인되어 있어요</Text>
              <Text style={styles.stateBody}>{authenticatedEmail}</Text>
              {state.isAnonymous ? (
                <View style={styles.developmentNotice}>
                  <Text style={styles.developmentNoticeTitle}>개발 전용 익명 세션</Text>
                  <Text style={styles.developmentNoticeBody}>
                    이 진입 방식은 개발 빌드와 명시적 데모 플래그에서만 제공돼요.
                  </Text>
                </View>
              ) : null}
              <Button
                fullWidth
                label="내 프로필 보기"
                onPress={() => router.replace('/(tabs)/profile')}
                size="large"
                variant="accent"
              />
              <Button
                fullWidth
                label="로그아웃"
                loading={working}
                onPress={() => void signOut()}
                variant="ghost"
              />
            </View>
          ) : null}

          {state.status === 'unauthenticated' ? (
            <View style={styles.formCard}>
              <View style={styles.stepRow}>
                <Text style={styles.stepLabel}>{step === 'email' ? '1 / 2' : '2 / 2'}</Text>
                <Text style={styles.stepName}>
                  {step === 'email' ? '이메일 입력' : '코드 확인'}
                </Text>
              </View>

              {step === 'email' ? (
                <>
                  <Text style={styles.formTitle}>이메일로 계속하기</Text>
                  <Text style={styles.formBody}>
                    계정이 없으면 같은 이메일로 안전하게 프로필을 만들어요.
                  </Text>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>이메일</Text>
                    <TextInput
                      accessibilityLabel="로그인 이메일"
                      autoCapitalize="none"
                      autoComplete="email"
                      autoCorrect={false}
                      keyboardType="email-address"
                      onChangeText={setEmail}
                      onSubmitEditing={() => {
                        if (!working) void requestCode();
                      }}
                      placeholder="name@example.com"
                      placeholderTextColor={colors.textSubtle}
                      returnKeyType="send"
                      style={styles.input}
                      textContentType="emailAddress"
                      value={email}
                    />
                  </View>
                  <Button
                    fullWidth
                    label="로그인 코드 받기"
                    loading={working}
                    onPress={() => void requestCode()}
                    size="large"
                    variant="accent"
                  />
                </>
              ) : (
                <>
                  <Text style={styles.formTitle}>메일에서 코드를 확인해 주세요</Text>
                  <Text style={styles.formBody}>
                    {email}로 보낸 숫자 코드를 입력하거나 메일의 로그인 링크를 열어도 돼요.
                  </Text>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>로그인 코드</Text>
                    <TextInput
                      accessibilityLabel="이메일 로그인 코드"
                      autoComplete="one-time-code"
                      keyboardType="number-pad"
                      maxLength={10}
                      onChangeText={(value) => setToken(value.replace(/\D/g, ''))}
                      onSubmitEditing={() => {
                        if (!working) void verifyCode();
                      }}
                      placeholder="6자리 이상 숫자"
                      placeholderTextColor={colors.textSubtle}
                      returnKeyType="done"
                      style={[styles.input, styles.codeInput]}
                      textContentType="oneTimeCode"
                      value={token}
                    />
                  </View>
                  <Button
                    fullWidth
                    label="코드 확인"
                    loading={working}
                    onPress={() => void verifyCode()}
                    size="large"
                    variant="accent"
                  />
                  <View style={styles.secondaryActions}>
                    <Button
                      disabled={working}
                      label="새 코드 받기"
                      onPress={() => void resendCode()}
                      variant="ghost"
                    />
                    <Button
                      disabled={working}
                      label="취소"
                      onPress={cancelVerification}
                      variant="ghost"
                    />
                  </View>
                </>
              )}

              {notice ? (
                <View accessibilityLiveRegion="polite" style={styles.noticeCard}>
                  <AppIcon color={colors.success} name="check" size={18} />
                  <Text style={styles.noticeText}>{notice}</Text>
                </View>
              ) : null}
              {error ? (
                <View
                  accessibilityLiveRegion="assertive"
                  accessibilityRole="alert"
                  style={styles.inlineError}
                >
                  <AppIcon color={colors.error} name="warning" size={18} />
                  <Text style={styles.inlineErrorText}>{error}</Text>
                </View>
              ) : null}

              {isDemoAnonymousAuthEnabled ? (
                <View style={styles.developmentEntry}>
                  <View style={styles.developmentRule} />
                  <Text style={styles.developmentLabel}>DEVELOPMENT ONLY</Text>
                  <View style={styles.developmentRule} />
                  <Text style={styles.developmentCopy}>
                    테스트 데이터 확인을 위한 익명 세션이에요. 배포 빌드에는 나타나지 않아요.
                  </Text>
                  <Button
                    disabled={working}
                    fullWidth
                    label="개발용 익명 세션 시작"
                    onPress={() => void enterDevelopmentSession()}
                    variant="secondary"
                  />
                </View>
              ) : null}

              {!isSupabaseConfigured ? (
                <Text accessibilityRole="alert" style={styles.configurationNote}>
                  Supabase 공개 환경변수가 없어 이메일 로그인을 요청할 수 없어요.
                </Text>
              ) : null}
            </View>
          ) : null}

          {state.status === 'authenticated' && error ? (
            <Text
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={styles.signOutError}
            >
              {error}
            </Text>
          ) : null}
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
    maxWidth: 560,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.page,
    width: '100%',
  },
  closeButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: interaction.minimumTarget,
    justifyContent: 'center',
    marginLeft: -spacing.md,
    width: interaction.minimumTarget,
  },
  pressed: { opacity: 0.72 },
  brandMark: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    height: 66,
    justifyContent: 'center',
    marginTop: spacing.xl,
    overflow: 'hidden',
    width: 66,
  },
  brandLetter: {
    color: colors.textInverse,
    fontFamily: fontFamilies.displayExtraBold,
    fontSize: 36,
    lineHeight: 42,
  },
  brandStripe: {
    backgroundColor: colors.accent,
    bottom: 0,
    height: 6,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 12,
    letterSpacing: 1.6,
    marginTop: spacing.xxl,
  },
  title: {
    color: colors.text,
    fontFamily: fontFamilies.displayExtraBold,
    fontSize: 34,
    lineHeight: 43,
    marginTop: spacing.sm,
  },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 24, marginTop: spacing.md },
  stateCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.xxxl,
    padding: spacing.xxl,
  },
  errorState: {
    alignItems: 'center',
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.xxxl,
    padding: spacing.xxl,
  },
  signedInCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.xxxl,
    padding: spacing.xxl,
  },
  stateIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  errorStateIcon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  successIcon: {
    alignItems: 'center',
    backgroundColor: colors.successSoft,
    borderRadius: radii.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  developmentNotice: {
    alignSelf: 'stretch',
    backgroundColor: colors.warningSoft,
    borderRadius: radii.md,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  developmentNoticeTitle: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
  },
  developmentNoticeBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.lg,
    marginTop: spacing.xxxl,
    padding: spacing.xl,
  },
  stepRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  stepLabel: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    color: colors.textInverse,
    fontFamily: fontFamilies.accentBold,
    fontSize: 12,
    letterSpacing: 0.8,
    lineHeight: 18,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  stepName: { color: colors.textMuted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  formTitle: { color: colors.text, fontSize: 20, lineHeight: 27, fontWeight: '800' },
  formBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: -spacing.sm },
  field: { gap: spacing.xs },
  fieldLabel: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: interaction.controlHeightLarge,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  codeInput: {
    fontFamily: fontFamilies.accentBold,
    fontSize: 24,
    letterSpacing: 4,
    textAlign: 'center',
  },
  secondaryActions: { flexDirection: 'row', justifyContent: 'space-between' },
  noticeCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.successSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  noticeText: { color: colors.success, flex: 1, fontSize: 13, lineHeight: 19 },
  inlineError: {
    alignItems: 'flex-start',
    backgroundColor: colors.errorSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  inlineErrorText: {
    color: colors.error,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  developmentEntry: { alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  developmentRule: { backgroundColor: colors.border, height: 1, width: '100%' },
  developmentLabel: {
    color: colors.warning,
    fontFamily: fontFamilies.accentBold,
    fontSize: 11,
    letterSpacing: 1.4,
  },
  developmentCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  configurationNote: { color: colors.error, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  signOutError: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});

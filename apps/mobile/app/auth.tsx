import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';

import { colors, radii } from '../lib/theme';
import { isSupabaseConfigured, supabase } from '../lib/supabase/client';
import { AppText as Text, fontFamilies } from '../lib/typography';

export default function AuthScreen() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setSignedIn(Boolean(data.session));
        setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  async function continueAsGuest() {
    if (!supabase) return;
    setError(null);
    setWorking(true);
    const { error: signInError } = await supabase.auth.signInAnonymously();
    setWorking(false);
    if (signInError) {
      setError('게스트 로그인에 실패했어요. Supabase에서 Anonymous Auth를 켜주세요.');
      return;
    }
    setSignedIn(true);
  }

  async function signOut() {
    if (!supabase) return;
    setWorking(true);
    await supabase.auth.signOut();
    setWorking(false);
    setSignedIn(false);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Pressable
          accessibilityLabel="닫기"
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
        <View style={styles.logo}>
          <Text style={styles.logoText}>I</Text>
        </View>
        <Text style={styles.eyebrow}>WELCOME TO ICEGEAR</Text>
        <Text style={styles.title}>겨울 스포츠를{`\n`}더 가깝게 즐겨요.</Text>
        <Text style={styles.body}>
          관심 상품을 찜하고, 이웃과 채팅하고, 커뮤니티에 이야기를 남겨보세요.
        </Text>

        {loading ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : null}
        {!loading && signedIn ? (
          <View style={styles.loggedInCard}>
            <Text style={styles.loggedInTitle}>게스트로 로그인되어 있어요</Text>
            <Text style={styles.loggedInBody}>이제 판매글과 커뮤니티 글을 작성할 수 있습니다.</Text>
            <Pressable onPress={() => router.back()} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>IceGear 시작하기</Text>
            </Pressable>
            <Pressable
              disabled={working}
              onPress={() => void signOut()}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>로그아웃</Text>
            </Pressable>
          </View>
        ) : null}
        {!loading && !signedIn ? (
          <View style={styles.actionArea}>
            {!isSupabaseConfigured ? (
              <Text style={styles.notice}>Supabase 환경변수가 없어 데모 모드로 실행 중이에요.</Text>
            ) : null}
            <Pressable
              disabled={working || !isSupabaseConfigured}
              onPress={() => void continueAsGuest()}
              style={[styles.primaryButton, !isSupabaseConfigured ? styles.disabled : null]}
            >
              {working ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.primaryButtonText}>게스트로 시작하기</Text>
              )}
            </Pressable>
            <Text style={styles.helper}>이메일 가입 없이 바로 시작할 수 있어요.</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: { flex: 1, padding: 24 },
  closeButton: { alignSelf: 'flex-start', height: 42, justifyContent: 'center', width: 42 },
  closeText: { color: colors.ink, fontSize: 30, fontWeight: '300' },
  logo: {
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: 20,
    height: 64,
    justifyContent: 'center',
    marginTop: 40,
    width: 64,
  },
  logoText: {
    color: '#F5B67F',
    fontFamily: fontFamilies.accentBold,
    fontSize: 36,
    fontWeight: '900',
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 28,
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.displayExtraBold,
    fontSize: 31,
    fontWeight: '900',
    lineHeight: 40,
    marginTop: 9,
  },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 13 },
  loader: { marginTop: 45 },
  actionArea: { marginTop: 44 },
  loggedInCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    marginTop: 38,
    padding: 18,
  },
  loggedInTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  loggedInBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 17,
  },
  primaryButtonText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 5 },
  secondaryButtonText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  helper: { color: colors.subtle, fontSize: 11, marginTop: 10, textAlign: 'center' },
  notice: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 5,
    textAlign: 'center',
  },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 16, textAlign: 'center' },
});

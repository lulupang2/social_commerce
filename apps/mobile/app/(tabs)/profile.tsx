import { useRouter } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

import { colors, radii } from '../../lib/theme';
import { AppText as Text, fontFamilies } from '../../lib/typography';

function MenuRow({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: string;
  label: string;
  detail?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuRow}>
      <View style={styles.menuIcon}>
        <Text style={styles.menuIconText}>{icon}</Text>
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      {detail ? <Text style={styles.menuDetail}>{detail}</Text> : null}
      <Text style={styles.menuChevron}>›</Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>MY ICEGEAR</Text>
            <Text style={styles.title}>나의 IceGear</Text>
          </View>
          <Pressable accessibilityLabel="설정" style={styles.settings}>
            <Text style={styles.settingsText}>⚙</Text>
          </Pressable>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>I</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileTitle}>IceGear에 오신 것을 환영해요</Text>
            <Text style={styles.profileBody}>
              로그인하면 찜, 판매 내역, 채팅을 한 곳에서 관리할 수 있어요.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/auth')}
            style={styles.loginButton}
          >
            <Text style={styles.loginText}>로그인</Text>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>판매중</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>거래완료</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>찜한상품</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>나의 활동</Text>
        <View style={styles.menuCard}>
          <MenuRow icon="♡" label="찜한 상품" detail="0" />
          <MenuRow
            icon="▣"
            label="내가 올린 상품"
            detail="0"
            onPress={() => router.push('/(tabs)/sell')}
          />
          <MenuRow
            icon="✎"
            label="내 커뮤니티 글"
            detail="0"
            onPress={() => router.push('/(tabs)/community')}
          />
        </View>

        <Text style={styles.sectionTitle}>안내 및 설정</Text>
        <View style={styles.menuCard}>
          <MenuRow icon="?" label="안전 거래 가이드" />
          <MenuRow icon="◎" label="알림 설정" />
          <MenuRow icon="ⓘ" label="IceGear 이용약관" />
        </View>
        <Text style={styles.version}>IceGear MVP · v0.1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: { paddingBottom: 30, paddingHorizontal: 18 },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 14,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.displayExtraBold,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 6,
  },
  settings: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  settingsText: { color: colors.ink, fontSize: 19 },
  profileCard: {
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    flexDirection: 'row',
    marginTop: 21,
    padding: 17,
  },
  profileAvatar: {
    alignItems: 'center',
    backgroundColor: '#F5B67F',
    borderRadius: radii.pill,
    height: 47,
    justifyContent: 'center',
    width: 47,
  },
  profileAvatarText: { color: colors.navy, fontSize: 19, fontWeight: '900' },
  profileCopy: { flex: 1, marginLeft: 12 },
  profileTitle: { color: colors.surface, fontSize: 13, fontWeight: '800', lineHeight: 18 },
  profileBody: { color: '#D6E0EF', fontSize: 11, lineHeight: 16, marginTop: 4 },
  loginButton: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    marginLeft: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  loginText: { color: colors.navy, fontSize: 11, fontWeight: '800' },
  statsRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingVertical: 17,
  },
  stat: { alignItems: 'center', flex: 1 },
  statNumber: {
    color: colors.ink,
    fontFamily: fontFamilies.accentBold,
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 5 },
  statDivider: { backgroundColor: colors.line, height: 27, width: 1 },
  sectionTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
    marginTop: 25,
  },
  menuCard: { backgroundColor: colors.surface, borderRadius: radii.md, overflow: 'hidden' },
  menuRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 57,
    paddingHorizontal: 14,
  },
  menuIcon: {
    alignItems: 'center',
    backgroundColor: colors.canvas,
    borderRadius: radii.sm,
    height: 31,
    justifyContent: 'center',
    width: 31,
  },
  menuIconText: { color: colors.navy, fontSize: 16, fontWeight: '800' },
  menuLabel: { color: colors.ink, flex: 1, fontSize: 13, fontWeight: '700', marginLeft: 11 },
  menuDetail: { color: colors.subtle, fontSize: 12, marginRight: 10 },
  menuChevron: { color: colors.subtle, fontSize: 22, fontWeight: '300' },
  version: { color: colors.subtle, fontSize: 11, marginTop: 25, textAlign: 'center' },
});

import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, interaction, radii, spacing } from '../../lib/theme';
import { AppText, AppTextInput, fontFamilies } from '../../lib/typography';
import { AppIcon } from '../ui/AppIcon';
import { IconButton } from '../ui/IconButton';

export interface EditorialHeaderProps {
  query: string;
  onQueryChange: (text: string) => void;
  onClearQuery: () => void;
  locationName?: string;
  onLocationPress?: () => void;
}

export function EditorialHeader({
  query,
  onQueryChange,
  onClearQuery,
  locationName = '서울 · 내 주변',
  onLocationPress,
}: EditorialHeaderProps) {
  return (
    <View style={styles.container}>
      {/* Top Greeting & Actions Bar */}
      <View style={styles.topBar}>
        <View style={styles.identityGroup}>
          <AppText style={styles.greeting} variant="caption">
            안녕하세요, 겨울러버님 ⛷️
          </AppText>
          <Pressable
            accessibilityHint="거래 위치를 선택합니다"
            accessibilityLabel={`현재 위치: ${locationName}`}
            accessibilityRole="button"
            onPress={onLocationPress}
            style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}
          >
            <AppIcon color={colors.accent} name="location" size={18} />
            <AppText style={styles.locationText} variant="headline">
              {locationName}
            </AppText>
            <AppIcon color={colors.textMuted} name="chevronRight" size={14} />
          </Pressable>
        </View>

        <View style={styles.topActions}>
          <Link href="/(tabs)/sell" asChild>
            <Pressable
              accessibilityHint="장비 판매 등록 화면으로 이동합니다"
              accessibilityLabel="내 장비 팔기"
              accessibilityRole="button"
              style={({ pressed }) => [styles.sellButton, pressed && styles.pressed]}
            >
              <AppIcon color={colors.accent} name="add" size={16} />
              <AppText style={styles.sellButtonText} variant="label">
                내 장비 팔기
              </AppText>
            </Pressable>
          </Link>
        </View>
      </View>

      {/* Search Input with Clear State */}
      <View style={styles.searchBox}>
        <AppIcon color={colors.textMuted} name="search" size={20} />
        <AppTextInput
          accessibilityHint="키워드로 스포츠 장비를 검색합니다"
          accessibilityLabel="장비 검색어 입력"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onQueryChange}
          placeholder="스키, 아이스하키 장비를 검색해 보세요"
          placeholderTextColor={colors.textSubtle}
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
        {query.length > 0 ? (
          <IconButton
            accessibilityLabel="검색어 지우기"
            icon="close"
            iconSize={16}
            onPress={onClearQuery}
            size={32}
            tone="default"
          />
        ) : null}
      </View>

      {/* Hero Editorial Banner */}
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <View style={styles.kickerRow}>
            <AppText style={styles.heroKicker} variant="caption">
              ICEGEAR PICK
            </AppText>
            <View style={styles.badgePill}>
              <AppText style={styles.badgePillText} variant="caption">
                CIRCULAR GEAR
              </AppText>
            </View>
          </View>
          <AppText style={styles.heroTitle} variant="display">
            이번 겨울,{'\n'}내 장비를 찾는 가장 가까운 방법
          </AppText>
          <AppText style={styles.heroSubtitle} variant="body">
            믿을 수 있는 이웃과 스키·하키 장비를 직거래해보세요.
          </AppText>
        </View>
        <AppText style={styles.heroArt}>⛷️</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  identityGroup: {
    gap: spacing.xxs,
  },
  greeting: {
    color: colors.textMuted,
  },
  locationButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  locationText: {
    color: colors.text,
  },
  topActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sellButton: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  sellButtonText: {
    color: colors.accent,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    paddingVertical: spacing.xs,
  },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    flexDirection: 'row',
    minHeight: 140,
    overflow: 'hidden',
    padding: spacing.xl,
    position: 'relative',
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
    zIndex: 1,
  },
  kickerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  heroKicker: {
    color: '#B7C9E5',
    fontFamily: fontFamilies.accentBold,
    letterSpacing: 1.2,
  },
  badgePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  badgePillText: {
    color: '#E8F0F7',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: colors.textInverse,
    fontSize: 21,
    lineHeight: 28,
  },
  heroSubtitle: {
    color: '#D6E0EF',
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 260,
  },
  heroArt: {
    fontSize: 72,
    opacity: 0.9,
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    transform: [{ rotate: '-10deg' }],
  },
});

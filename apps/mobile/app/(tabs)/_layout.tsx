import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { AppIcon, type AppIconName } from '../../components/ui/AppIcon';
import { colors, iconSizes, radii, spacing } from '../../lib/theme';
import { fontFamilies } from '../../lib/typography';

const tabIcons: Record<string, AppIconName> = {
  index: 'home',
  community: 'community',
  sell: 'add',
  chats: 'chat',
  profile: 'profile',
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        freezeOnBlur: true,
        headerShown: false,
        tabBarAccessibilityLabel: `${route.name} 탭`,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
        tabBarIcon: ({ color }) => (
          <AppIcon color={color} name={tabIcons[route.name] ?? 'home'} size={iconSizes.md} />
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: '홈', tabBarAccessibilityLabel: '홈 탭' }} />
      <Tabs.Screen
        name="community"
        options={{ title: '커뮤니티', tabBarAccessibilityLabel: '커뮤니티 탭' }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: '판매',
          tabBarAccessibilityLabel: '장비 판매하기 탭',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.sellAction, focused && styles.sellActionFocused]}>
              <AppIcon color={colors.textInverse} name="add" size={iconSizes.lg} />
            </View>
          ),
          tabBarLabelStyle: styles.sellLabel,
        }}
      />
      <Tabs.Screen name="chats" options={{ title: '채팅', tabBarAccessibilityLabel: '채팅 탭' }} />
      <Tabs.Screen
        name="profile"
        options={{ title: '나의 IceGear', tabBarAccessibilityLabel: '나의 IceGear 탭' }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: Platform.select({ ios: 84, default: 70 }),
    paddingBottom: Platform.select({ ios: spacing.xl, default: spacing.sm }),
    paddingTop: spacing.sm,
  },
  label: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 10,
    fontWeight: 'normal',
    lineHeight: 14,
  },
  sellAction: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 4,
    height: 52,
    justifyContent: 'center',
    marginTop: -spacing.xl,
    width: 52,
  },
  sellActionFocused: { backgroundColor: colors.accent },
  sellLabel: {
    color: colors.text,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 10,
    fontWeight: 'normal',
    lineHeight: 14,
  },
});

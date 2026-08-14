import { Tabs } from 'expo-router';
import { Platform, StyleSheet, Text } from 'react-native';

import { colors } from '../../lib/theme';
import { fontFamilies } from '../../lib/typography';

const tabIcons: Record<string, string> = {
  index: '⌂',
  community: '◉',
  sell: '+',
  chats: '▢',
  profile: '○',
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.subtle,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
        tabBarIcon: ({ color, focused }) => (
          <Text style={[styles.icon, { color }, focused ? styles.iconFocused : null]}>
            {tabIcons[route.name] ?? '·'}
          </Text>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="community" options={{ title: '커뮤니티' }} />
      <Tabs.Screen
        name="sell"
        options={{
          title: '판매',
          tabBarIcon: ({ color }) => <Text style={[styles.sellIcon, { color }]}>+</Text>,
        }}
      />
      <Tabs.Screen name="chats" options={{ title: '채팅' }} />
      <Tabs.Screen name="profile" options={{ title: '나의 IceGear' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: Platform.select({ ios: 84, default: 66 }),
    paddingBottom: Platform.select({ ios: 22, default: 8 }),
    paddingTop: 7,
  },
  label: { fontFamily: fontFamilies.bodySemiBold, fontSize: 10, fontWeight: 'normal' },
  icon: { fontSize: 22, fontWeight: '500', lineHeight: 24 },
  iconFocused: { fontWeight: '800' },
  sellIcon: { fontSize: 30, fontWeight: '300', lineHeight: 27 },
});

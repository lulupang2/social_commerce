import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';

import { SessionProvider } from '../lib/auth';
import { useIceGearFonts } from '../lib/typography';

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync();
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useIceGearFonts();

  useEffect(() => {
    if (Platform.OS !== 'web' && (fontsLoaded || fontError)) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) return null;

  return (
    <SessionProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F7F8FA' } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="listing/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="community/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="community/create" options={{ presentation: 'modal' }} />
        <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="create" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
      </Stack>
    </SessionProvider>
  );
}

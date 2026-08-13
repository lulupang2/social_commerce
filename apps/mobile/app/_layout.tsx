import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerTitle: 'IceGear' }}>
      <Stack.Screen name="index" options={{ title: 'Market' }} />
      <Stack.Screen name="listing/[id]" options={{ title: 'Listing' }} />
      <Stack.Screen name="create" options={{ title: 'Create listing' }} />
    </Stack>
  );
}

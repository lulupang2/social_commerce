import { Stack } from 'expo-router';

export default function TabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="sell" />
      <Stack.Screen name="community" />
      <Stack.Screen name="chats" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}

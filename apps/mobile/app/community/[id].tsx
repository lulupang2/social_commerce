import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SummerGearWebView } from '../../components/webview/SummerGearWebView';

export default function CommunityDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SummerGearWebView initialUrl={`http://localhost:3000/community/${id || ''}`} />;
}

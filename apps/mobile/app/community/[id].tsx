import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  resolveSummerGearWebUrl,
  SummerGearWebView,
} from '../../components/webview/SummerGearWebView';

export default function CommunityDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SummerGearWebView
      initialUrl={resolveSummerGearWebUrl(`/community/${encodeURIComponent(id || '')}`)}
    />
  );
}

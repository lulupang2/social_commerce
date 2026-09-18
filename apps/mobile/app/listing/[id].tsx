import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  resolveSummerGearWebUrl,
  SummerGearWebView,
} from '../../components/webview/SummerGearWebView';

export default function ListingDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SummerGearWebView
      initialUrl={resolveSummerGearWebUrl(`/market/${encodeURIComponent(id || '')}`)}
    />
  );
}

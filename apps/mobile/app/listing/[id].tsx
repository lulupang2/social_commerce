import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SummerGearWebView } from '../../components/webview/SummerGearWebView';

export default function ListingDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SummerGearWebView initialUrl={`http://localhost:3000/market/${id || ''}`} />;
}

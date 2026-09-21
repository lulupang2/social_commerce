import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  resolveSummerGearWebUrl,
  SummerGearWebView,
} from '../../components/webview/SummerGearWebView';

export default function ChatRoomRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SummerGearWebView
      initialUrl={resolveSummerGearWebUrl(`/chat/${encodeURIComponent(id || '')}`)}
    />
  );
}

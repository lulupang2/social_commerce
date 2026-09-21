import React from 'react';
import {
  resolveSummerGearWebUrl,
  SummerGearWebView,
} from '../../components/webview/SummerGearWebView';

export default function TabChats() {
  return <SummerGearWebView initialUrl={resolveSummerGearWebUrl('/chats')} />;
}

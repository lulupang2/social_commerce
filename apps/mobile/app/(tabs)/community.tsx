import React from 'react';
import {
  resolveSummerGearWebUrl,
  SummerGearWebView,
} from '../../components/webview/SummerGearWebView';

export default function TabCommunity() {
  return <SummerGearWebView initialUrl={resolveSummerGearWebUrl('/community')} />;
}

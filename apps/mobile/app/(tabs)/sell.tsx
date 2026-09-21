import React from 'react';
import {
  resolveSummerGearWebUrl,
  SummerGearWebView,
} from '../../components/webview/SummerGearWebView';

export default function TabSell() {
  return <SummerGearWebView initialUrl={resolveSummerGearWebUrl('/sell')} />;
}

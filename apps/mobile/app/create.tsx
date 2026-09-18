import React from 'react';
import {
  resolveSummerGearWebUrl,
  SummerGearWebView,
} from '../components/webview/SummerGearWebView';

export default function MobileCreateRoute() {
  return <SummerGearWebView initialUrl={resolveSummerGearWebUrl('/sell')} />;
}

import React from 'react';
import {
  resolveSummerGearWebUrl,
  SummerGearWebView,
} from '../components/webview/SummerGearWebView';

export default function MobileAuthRoute() {
  return <SummerGearWebView initialUrl={resolveSummerGearWebUrl('/auth')} />;
}

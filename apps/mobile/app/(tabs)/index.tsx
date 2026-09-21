import React from 'react';
import {
  resolveSummerGearWebUrl,
  SummerGearWebView,
} from '../../components/webview/SummerGearWebView';

export default function TabHome() {
  return <SummerGearWebView initialUrl={resolveSummerGearWebUrl()} />;
}

import React from 'react';
import {
  resolveSummerGearWebUrl,
  SummerGearWebView,
} from '../../components/webview/SummerGearWebView';

export default function TabProfile() {
  return <SummerGearWebView initialUrl={resolveSummerGearWebUrl('/profile')} />;
}

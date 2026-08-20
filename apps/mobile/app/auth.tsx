import React from 'react';
import { SummerGearWebView } from '../components/webview/SummerGearWebView';

export default function MobileAuthRoute() {
  return <SummerGearWebView initialUrl="http://localhost:3000/auth" />;
}

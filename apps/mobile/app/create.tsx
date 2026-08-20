import React from 'react';
import { SummerGearWebView } from '../components/webview/SummerGearWebView';

export default function MobileCreateRoute() {
  return <SummerGearWebView initialUrl="http://localhost:3000/sell" />;
}

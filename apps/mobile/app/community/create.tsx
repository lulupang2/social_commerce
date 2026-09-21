import React from 'react';
import {
  resolveSummerGearWebUrl,
  SummerGearWebView,
} from '../../components/webview/SummerGearWebView';

export default function CommunityCreateRoute() {
  return <SummerGearWebView initialUrl={resolveSummerGearWebUrl('/community/create')} />;
}

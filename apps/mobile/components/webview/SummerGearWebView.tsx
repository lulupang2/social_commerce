import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  BackHandler,
  Platform,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';

const DEFAULT_WEB_URL =
  process.env.EXPO_PUBLIC_WEB_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');

interface SummerGearWebViewProps {
  initialUrl?: string;
}

// React 19 / RN JSX component type adapter
const BrowserView = WebView as unknown as React.ComponentType<Record<string, unknown>>;

export function SummerGearWebView({ initialUrl = DEFAULT_WEB_URL }: SummerGearWebViewProps) {
  const webViewRef = useRef<{ goBack: () => void; reload: () => void } | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Android Back Button handling
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [canGoBack]);

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    setIsLoading(navState.loading);
  };

  const handleReload = () => {
    setHasError(false);
    setIsLoading(true);
    webViewRef.current?.reload();
  };

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as Record<string, unknown>;
      console.log('[NativeBridge] Received:', data);
    } catch {
      console.log('[NativeBridge] Raw message:', event.nativeEvent.data);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <iframe
          src={initialUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="SummerGear Web"
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={styles.webViewWrapper}>
        <BrowserView
          ref={webViewRef}
          source={{ uri: initialUrl }}
          style={styles.webView}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadStart={() => {
            setIsLoading(true);
            setHasError(false);
          }}
          onLoadEnd={() => setIsLoading(false)}
          onError={(syntheticEvent: { nativeEvent: { description?: string } }) => {
            const { nativeEvent } = syntheticEvent;
            setHasError(true);
            setErrorMessage(nativeEvent.description || '페이지를 불러올 수 없습니다.');
            setIsLoading(false);
          }}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          scalesPageToFit={true}
          allowsBackForwardNavigationGestures={true}
          pullToRefreshEnabled={true}
          bounces={true}
          overScrollMode="always"
          mixedContentMode="compatibility"
          userAgent="SummerGearMobileApp/1.0"
        />

        {/* Loading Indicator */}
        {isLoading && !hasError && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#0284c7" />
          </View>
        )}

        {/* Error Fallback */}
        {hasError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>서버에 연결할 수 없습니다</Text>
            <Text style={styles.errorDescription}>{initialUrl}</Text>
            <Text style={styles.errorSub}>
              Next.js 웹 서버가 실행 중인지 확인해주세요.{'\n'}(pnpm dev:web)
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleReload}>
              <Text style={styles.retryButtonText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webViewWrapper: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  errorDescription: {
    fontSize: 14,
    color: '#0284c7',
    fontWeight: '600',
    marginBottom: 8,
  },
  errorSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});

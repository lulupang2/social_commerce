import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import {
  createBridgeDispatchScript,
  isTrustedNavigation,
  parseBridgeRequest,
  type BridgeMediaAsset,
  type HapticStyle,
  type NativeBridgeResponse,
  type PickMediaRequest,
} from './bridge';

const DEFAULT_WEB_URL =
  process.env.EXPO_PUBLIC_WEB_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');

export function resolveSummerGearWebUrl(path = '/'): string {
  const baseUrl = DEFAULT_WEB_URL.endsWith('/') ? DEFAULT_WEB_URL : `${DEFAULT_WEB_URL}/`;
  return new URL(path.replace(/^\//, ''), baseUrl).toString();
}

interface SummerGearWebViewProps {
  initialUrl?: string;
}

interface BrowserViewHandle {
  goBack(): void;
  injectJavaScript(script: string): void;
  reload(): void;
}

const BrowserView = WebView as unknown as React.ComponentType<Record<string, unknown>>;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function SummerGearWebView({ initialUrl = DEFAULT_WEB_URL }: SummerGearWebViewProps) {
  const webViewRef = useRef<BrowserViewHandle | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const trustedOrigin = useMemo(() => {
    try {
      return new URL(initialUrl).origin;
    } catch {
      return initialUrl;
    }
  }, [initialUrl]);

  const dispatchToWeb = useCallback((response: NativeBridgeResponse) => {
    webViewRef.current?.injectJavaScript(createBridgeDispatchScript(response));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack || !webViewRef.current) return false;
      webViewRef.current.goBack();
      return true;
    });

    return () => subscription.remove();
  }, [canGoBack]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route;
      if (typeof route !== 'string' || !route.startsWith('/')) return;
      const target = new URL(route, initialUrl).toString();
      if (!isTrustedNavigation(target, initialUrl)) return;
      webViewRef.current?.injectJavaScript(
        `window.location.assign(${JSON.stringify(target)}); true;`,
      );
    });

    return () => subscription.remove();
  }, [initialUrl]);

  const pickMedia = useCallback(
    async (request: PickMediaRequest) => {
      const permission =
        request.source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        dispatchToWeb({
          type: 'SUMMERGEAR_BRIDGE_ERROR',
          requestId: request.requestId,
          code: 'permission_denied',
          message:
            request.source === 'camera'
              ? '카메라 권한을 허용해 주세요.'
              : '사진 접근 권한을 허용해 주세요.',
        });
        return;
      }

      const result =
        request.source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              allowsEditing: false,
              mediaTypes: ['images'],
              quality: 0.9,
            })
          : await ImagePicker.launchImageLibraryAsync({
              allowsMultipleSelection: request.maxCount > 1,
              mediaTypes: ['images'],
              quality: 0.9,
              selectionLimit: request.maxCount,
            });

      if (result.canceled) {
        dispatchToWeb({
          type: 'SUMMERGEAR_MEDIA_RESULT',
          requestId: request.requestId,
          assets: [],
        });
        return;
      }

      const assets: BridgeMediaAsset[] = [];
      const selectedAssets = result.assets.slice(
        0,
        request.source === 'camera' ? 1 : request.maxCount,
      );
      for (const [index, asset] of selectedAssets.entries()) {
        const resize =
          Math.max(asset.width, asset.height) > 1600
            ? [
                {
                  resize: {
                    width: Math.round((asset.width / Math.max(asset.width, asset.height)) * 1600),
                  },
                },
              ]
            : [];
        const processed = await ImageManipulator.manipulateAsync(asset.uri, resize, {
          base64: true,
          compress: 0.72,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        if (!processed.base64) continue;
        const originalName = asset.fileName || `summergear-${Date.now()}-${index + 1}`;
        assets.push({
          id: `${request.requestId}-${index}`,
          dataUrl: `data:image/jpeg;base64,${processed.base64}`,
          fileName: `${originalName.replace(/\.[^/.]+$/, '')}.jpg`,
          mimeType: 'image/jpeg',
          width: processed.width,
          height: processed.height,
        });
      }

      if (assets.length === 0 && result.assets.length > 0) {
        dispatchToWeb({
          type: 'SUMMERGEAR_BRIDGE_ERROR',
          requestId: request.requestId,
          code: 'media_encoding_failed',
          message: '선택한 사진을 처리하지 못했어요. 다른 사진을 선택해 주세요.',
        });
        return;
      }

      dispatchToWeb({
        type: 'SUMMERGEAR_MEDIA_RESULT',
        requestId: request.requestId,
        assets,
      });
    },
    [dispatchToWeb],
  );

  const performHaptic = useCallback(async (style: HapticStyle) => {
    if (style === 'selection') {
      await Haptics.selectionAsync();
      return;
    }

    const feedbackByStyle: Record<
      Exclude<HapticStyle, 'selection'>,
      Haptics.NotificationFeedbackType
    > = {
      success: Haptics.NotificationFeedbackType.Success,
      warning: Haptics.NotificationFeedbackType.Warning,
      error: Haptics.NotificationFeedbackType.Error,
    };
    await Haptics.notificationAsync(feedbackByStyle[style]);
  }, []);

  const registerForPush = useCallback(
    async (requestId: string) => {
      if (!Device.isDevice || (Platform.OS !== 'ios' && Platform.OS !== 'android')) {
        dispatchToWeb({
          type: 'SUMMERGEAR_BRIDGE_ERROR',
          requestId,
          code: 'physical_device_required',
          message: '푸시 알림 등록은 실제 iOS 또는 Android 기기에서 지원해요.',
        });
        return;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('trade-messages', {
          name: '거래 채팅',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }

      let permission = await Notifications.getPermissionsAsync();
      if (permission.status !== 'granted') {
        permission = await Notifications.requestPermissionsAsync();
      }
      if (permission.status !== 'granted') {
        dispatchToWeb({
          type: 'SUMMERGEAR_BRIDGE_ERROR',
          requestId,
          code: 'permission_denied',
          message: '기기 설정에서 알림 권한을 허용해 주세요.',
        });
        return;
      }

      const projectId =
        Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
      const tokenResult = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      dispatchToWeb({
        type: 'SUMMERGEAR_PUSH_TOKEN_RESULT',
        requestId,
        token: tokenResult.data,
        platform: Platform.OS,
      });
    },
    [dispatchToWeb],
  );

  const showLocalNotification = useCallback(async (title: string, body: string, route?: string) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: route ? { route } : {},
      },
      trigger: null,
    });
  }, []);

  const handleMessage = useCallback(
    async (event: { nativeEvent: { data: string } }) => {
      const request = parseBridgeRequest(event.nativeEvent.data);
      if (!request) return;

      try {
        if (request.type === 'SUMMERGEAR_PICK_MEDIA') {
          await pickMedia(request);
        } else if (request.type === 'SUMMERGEAR_HAPTIC') {
          await performHaptic(request.style);
        } else if (request.type === 'SUMMERGEAR_REGISTER_PUSH') {
          await registerForPush(request.requestId);
        } else {
          await showLocalNotification(request.title, request.body, request.route);
        }
      } catch {
        dispatchToWeb({
          type: 'SUMMERGEAR_BRIDGE_ERROR',
          ...('requestId' in request ? { requestId: request.requestId } : {}),
          code: 'native_operation_failed',
          message: '기기 기능을 실행하지 못했어요. 잠시 후 다시 시도해 주세요.',
        });
      }
    },
    [dispatchToWeb, performHaptic, pickMedia, registerForPush, showLocalNotification],
  );

  const handleNavigationStateChange = useCallback((navigation: WebViewNavigation) => {
    setCanGoBack(navigation.canGoBack);
    setIsLoading(navigation.loading);
  }, []);

  const handleReload = useCallback(() => {
    setHasError(false);
    setErrorMessage('');
    setIsLoading(true);
    webViewRef.current?.reload();
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <iframe
          allow="camera; clipboard-read; clipboard-write"
          src={initialUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="SummerGear Web"
        />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <StatusBar style="dark" />
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
          onError={(event: { nativeEvent: { description?: string } }) => {
            setHasError(true);
            setErrorMessage(event.nativeEvent.description || '페이지를 불러올 수 없어요.');
            setIsLoading(false);
          }}
          onHttpError={(event: { nativeEvent: { statusCode?: number } }) => {
            if ((event.nativeEvent.statusCode ?? 0) < 500) return;
            setHasError(true);
            setErrorMessage('서버 응답이 지연되고 있어요.');
            setIsLoading(false);
          }}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={(request: { url: string }) => {
            if (isTrustedNavigation(request.url, initialUrl)) return true;
            void Linking.openURL(request.url);
            return false;
          }}
          allowsBackForwardNavigationGestures
          bounces
          domStorageEnabled
          javaScriptEnabled
          mixedContentMode="never"
          originWhitelist={[trustedOrigin, 'about:blank']}
          overScrollMode="always"
          pullToRefreshEnabled
          sharedCookiesEnabled
          startInLoadingState
          userAgent="SummerGearMobileApp/0.2"
        />

        {isLoading && !hasError ? (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <ActivityIndicator color="#0284c7" size="large" />
          </View>
        ) : null}

        {hasError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>SummerGear에 연결할 수 없어요</Text>
            <Text style={styles.errorDescription}>{errorMessage}</Text>
            <Text style={styles.errorSub}>네트워크 연결을 확인한 뒤 다시 시도해 주세요.</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={handleReload}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : null}
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
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
  },
  errorContainer: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  errorTitle: {
    marginBottom: 8,
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '700',
  },
  errorDescription: {
    marginBottom: 8,
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorSub: {
    marginBottom: 24,
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0284c7',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});

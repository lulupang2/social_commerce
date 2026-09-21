'use client';

import {
  NATIVE_BRIDGE_EVENT,
  nativeBridgeResponseSchema,
  type BridgeMediaAsset,
  type HapticStyle,
  type MediaSource,
  type NativeBridgeRequest,
  type NativeBridgeResponse,
} from '@icegear/domain';

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}

export class NativeBridgeError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'NativeBridgeError';
  }
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isNativeBridgeAvailable(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.ReactNativeWebView?.postMessage === 'function'
  );
}

function postBridgeRequest(request: NativeBridgeRequest): boolean {
  if (!isNativeBridgeAvailable()) return false;
  window.ReactNativeWebView?.postMessage(JSON.stringify(request));
  return true;
}

function waitForBridgeResponse(
  requestId: string,
  expectedType: NativeBridgeResponse['type'],
): Promise<NativeBridgeResponse> {
  const { promise, resolve, reject } = Promise.withResolvers<NativeBridgeResponse>();

  const handleResponse = (event: Event) => {
    const result = nativeBridgeResponseSchema.safeParse((event as CustomEvent<unknown>).detail);
    if (!result.success) return;
    const response = result.data;
    if (!('requestId' in response) || response.requestId !== requestId) return;

    window.clearTimeout(timeout);
    window.removeEventListener(NATIVE_BRIDGE_EVENT, handleResponse as EventListener);
    if (response.type === 'SUMMERGEAR_BRIDGE_ERROR') {
      reject(new NativeBridgeError(response.message, response.code));
      return;
    }
    if (response.type !== expectedType) {
      reject(
        new NativeBridgeError('기기에서 예상하지 못한 응답을 받았어요.', 'unexpected_response'),
      );
      return;
    }
    resolve(response);
  };

  const timeout = window.setTimeout(() => {
    window.removeEventListener(NATIVE_BRIDGE_EVENT, handleResponse as EventListener);
    reject(new NativeBridgeError('기기 응답 시간이 초과됐어요. 다시 시도해 주세요.', 'timeout'));
  }, 60_000);

  window.addEventListener(NATIVE_BRIDGE_EVENT, handleResponse as EventListener);
  return promise;
}

export async function requestNativeMedia(
  source: MediaSource,
  maxCount: number,
): Promise<BridgeMediaAsset[] | null> {
  if (!isNativeBridgeAvailable()) return null;

  const requestId = createRequestId();
  const responsePromise = waitForBridgeResponse(requestId, 'SUMMERGEAR_MEDIA_RESULT');
  postBridgeRequest({
    type: 'SUMMERGEAR_PICK_MEDIA',
    requestId,
    source,
    maxCount: Math.min(Math.max(Math.trunc(maxCount), 1), 10),
  });
  const response = await responsePromise;
  return response.type === 'SUMMERGEAR_MEDIA_RESULT' ? response.assets : [];
}

export function triggerNativeHaptic(style: HapticStyle): void {
  postBridgeRequest({ type: 'SUMMERGEAR_HAPTIC', style });
}

export async function requestNativePushToken(): Promise<{
  token: string;
  platform: 'ios' | 'android';
} | null> {
  if (!isNativeBridgeAvailable()) return null;

  const requestId = createRequestId();
  const responsePromise = waitForBridgeResponse(requestId, 'SUMMERGEAR_PUSH_TOKEN_RESULT');
  postBridgeRequest({ type: 'SUMMERGEAR_REGISTER_PUSH', requestId });
  const response = await responsePromise;
  return response.type === 'SUMMERGEAR_PUSH_TOKEN_RESULT'
    ? { token: response.token, platform: response.platform }
    : null;
}

export function showNativeLocalNotification(title: string, body: string, route?: string): void {
  postBridgeRequest({
    type: 'SUMMERGEAR_LOCAL_NOTIFICATION',
    title,
    body,
    ...(route ? { route } : {}),
  });
}

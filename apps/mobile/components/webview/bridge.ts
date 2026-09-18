import {
  NATIVE_BRIDGE_EVENT,
  nativeBridgeRequestSchema,
  type HapticStyle,
  type NativeBridgeRequest,
  type NativeBridgeResponse,
  type PickMediaRequest,
} from '@icegear/domain';

export { NATIVE_BRIDGE_EVENT };
export type {
  BridgeMediaAsset,
  HapticStyle,
  MediaSource,
  NativeBridgeRequest,
  NativeBridgeResponse,
  PickMediaRequest,
} from '@icegear/domain';

export function parseBridgeRequest(data: string): NativeBridgeRequest | null {
  if (data.length === 0 || data.length > 20_000) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  const result = nativeBridgeRequestSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function createBridgeDispatchScript(response: NativeBridgeResponse): string {
  const serialized = JSON.stringify(response)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(NATIVE_BRIDGE_EVENT)}, { detail: ${serialized} })); true;`;
}

export function isTrustedNavigation(requestUrl: string, initialUrl: string): boolean {
  if (requestUrl === 'about:blank') return true;

  try {
    return new URL(requestUrl).origin === new URL(initialUrl).origin;
  } catch {
    return false;
  }
}

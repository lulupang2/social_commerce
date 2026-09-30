'use client';

import { getGoSession } from './client';
import { apiErrorMessage } from '../api/error-message';

type PushResult = { ok: true } | { ok: false; message: string };

async function requestPush(method: 'POST' | 'DELETE', token: string, platform: 'ios' | 'android'): Promise<PushResult> {
  const session = await getGoSession();
  if (!session.ok) return { ok: false, message: session.message };
  try {
    const response = await fetch('/api/v1/me/push-devices', {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.session.csrfToken },
      body: JSON.stringify({ token, platform }),
    });
    if (response.ok) return { ok: true };
    const payload: unknown = await response.json().catch(() => null);
    return { ok: false, message: apiErrorMessage(response.status, payload, '알림 기기 상태를 저장하지 못했어요.') };
  } catch { return { ok: false, message: '알림 서버에 연결하지 못했어요.' }; }
}
export function registerGoPushDevice(token: string, platform: 'ios' | 'android') {
  return requestPush('POST', token, platform);
}
export function unregisterGoPushDevice(token: string, platform: 'ios' | 'android') {
  return requestPush('DELETE', token, platform);
}

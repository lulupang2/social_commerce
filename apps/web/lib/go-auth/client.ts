'use client';

import { apiErrorMessage } from '../api/error-message';
import { redirectIfUnauthorized } from './navigation';

export interface GoAuthMember {
  id: string;
  displayName: string | null;
  email: string | null;
  onboarded: boolean;
}

export interface GoAuthSessionView {
  member: GoAuthMember;
  csrfToken: string;
  session: {
    expiresAt: string;
    absoluteExpiresAt: string;
    reauthenticatedAt: string | null;
  };
}

interface GoAuthError {
  code?: string;
  message?: string;
}

export type GoSessionResult =
  | { ok: true; session: GoAuthSessionView }
  | { ok: false; message: string; code?: string; status?: number };

export type DevLoginResult = GoSessionResult;
export const AUTH_SESSION_EVENT = 'summergear:auth-session-changed';
export function notifyGoSessionChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

export async function getGoSession(options: { required?: boolean } = {}): Promise<GoSessionResult> {
  try {
    const response = await fetch('/api/v1/auth/session', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => null)) as GoAuthSessionView | GoAuthError | null;
    if (!response.ok) {
      const error = data as GoAuthError | null;
      if (options.required) redirectIfUnauthorized(response.status, true);
      return {
        ok: false,
        code: error?.code,
        status: response.status,
        message: apiErrorMessage(response.status, error, '로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'),
      };
    }
    const session = data as GoAuthSessionView | null;
    if (!session?.member?.id || !session.csrfToken) {
      return { ok: false, message: '로그인 서버 응답을 확인할 수 없어요.' };
    }
    return { ok: true, session };
  } catch {
    return { ok: false, message: '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' };
  }
}

export async function devSignIn(role?: 'buyer_a' | 'buyer_b' | 'seller_a' | 'seller_b' | 'reviewer'): Promise<DevLoginResult> {
  try {
    const response = await fetch('/api/v1/auth/dev-login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(role ? { 'Content-Type': 'application/json' } : {}) },
      ...(role ? { body: JSON.stringify({ role }) } : {}),
    });

    const data = (await response.json().catch(() => null)) as GoAuthSessionView | GoAuthError | null;
    if (!response.ok) {
      const error = data as GoAuthError | null;
      if (response.status === 404) {
        return {
          ok: false,
          code: 'DEV_LOGIN_DISABLED',
          message: '임시 로그인이 비활성화되어 있어요. 개발 서버 설정을 확인해 주세요.',
        };
      }
      return {
        ok: false,
        code: error?.code,
        message: apiErrorMessage(response.status, error, '임시 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.'),
      };
    }

    const session = data as GoAuthSessionView | null;
    if (!session?.member?.id || !session.csrfToken) {
      return { ok: false, message: '로그인 서버 응답을 확인할 수 없어요.' };
    }
    notifyGoSessionChanged();
    return { ok: true, session };
  } catch {
    return {
      ok: false,
      message: '로그인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
    };
  }
}

export async function fixtureRoles(): Promise<string[]> {
  try {
    const response = await fetch('/api/v1/auth/fixture-roles', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('roles' in data) || !Array.isArray(data.roles)) return [];
    return data.roles.filter((role): role is string =>
      role === 'buyer_a' || role === 'buyer_b' || role === 'seller_a' || role === 'seller_b' || role === 'reviewer');
  } catch { return []; }
}

export async function signOut(): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getGoSession();
  if (!session.ok) return { ok: false, message: session.message };
  try {
    const response = await fetch('/api/v1/auth/logout', {
      method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': session.session.csrfToken },
    });
    if (!response.ok) return { ok: false, message: '로그아웃하지 못했어요. 다시 시도해 주세요.' };
    notifyGoSessionChanged();
    return { ok: true };
  } catch { return { ok: false, message: '로그아웃 응답을 확인하지 못했어요.' }; }
}

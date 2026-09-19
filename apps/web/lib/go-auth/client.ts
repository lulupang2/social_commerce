'use client';

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

export async function getGoSession(): Promise<GoSessionResult> {
  try {
    const response = await fetch('/api/v1/auth/session', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => null)) as GoAuthSessionView | GoAuthError | null;
    if (!response.ok) {
      const error = data as GoAuthError | null;
      return {
        ok: false,
        code: error?.code,
        status: response.status,
        message: error?.message || '로그인 상태를 확인하지 못했어요.',
      };
    }
    const session = data as GoAuthSessionView | null;
    if (!session?.member?.id || !session.csrfToken) {
      return { ok: false, message: '로그인 서버 응답을 확인할 수 없어요.' };
    }
    return { ok: true, session };
  } catch {
    return { ok: false, message: 'Go API에 연결하지 못했어요.' };
  }
}

export async function devSignIn(): Promise<DevLoginResult> {
  try {
    const response = await fetch('/api/v1/auth/dev-login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
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
        message: error?.message || '임시 로그인에 실패했어요.',
      };
    }

    const session = data as GoAuthSessionView | null;
    if (!session?.member?.id || !session.csrfToken) {
      return { ok: false, message: '로그인 서버 응답을 확인할 수 없어요.' };
    }
    return { ok: true, session };
  } catch {
    return {
      ok: false,
      message: 'Go API에 연결하지 못했어요. 웹 API 프록시와 서버 실행 상태를 확인해 주세요.',
    };
  }
}

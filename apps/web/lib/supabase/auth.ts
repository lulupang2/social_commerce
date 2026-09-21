'use client';

import { createBrowserSupabaseClient } from './browser';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthActionResult {
  ok: boolean;
  reason?: 'unconfigured' | 'invalid_email' | 'request_failed';
  message: string;
}

export async function requestEmailSignIn(email: string): Promise<AuthActionResult> {
  const normalizedEmail = email.trim();
  if (normalizedEmail.length > 254 || !EMAIL_PATTERN.test(normalizedEmail)) {
    return { ok: false, reason: 'invalid_email', message: '올바른 이메일 주소를 입력해 주세요.' };
  }

  const client = createBrowserSupabaseClient();
  if (!client) {
    return {
      ok: false,
      reason: 'unconfigured',
      message: 'Supabase 연결 정보를 설정하면 이메일 로그인을 사용할 수 있어요.',
    };
  }

  try {
    const redirectTo = new URL('/auth/callback?next=/profile', window.location.origin).toString();
    const { error } = await client.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    });
    if (error) {
      return {
        ok: false,
        reason: 'request_failed',
        message: '인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
      };
    }
    return { ok: true, message: '인증 메일을 보냈어요.' };
  } catch {
    return {
      ok: false,
      reason: 'request_failed',
      message: '로그인 서버에 연결하지 못했어요. 네트워크를 확인해 주세요.',
    };
  }
}

export async function signOut(): Promise<AuthActionResult> {
  const client = createBrowserSupabaseClient();
  if (!client) {
    return { ok: false, reason: 'unconfigured', message: 'Supabase 연결 정보가 없어요.' };
  }

  const { error } = await client.auth.signOut();
  return error
    ? { ok: false, reason: 'request_failed', message: '로그아웃하지 못했어요.' }
    : { ok: true, message: '로그아웃했어요.' };
}

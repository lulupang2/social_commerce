'use client';

import { paymentRecoveryRequestSchema, recoveryDashboardSchema } from '@icegear/domain';
import { z } from 'zod';
import { getGoSession } from './client';
import { apiErrorMessage } from '../api/error-message';
import { redirectIfUnauthorized } from './navigation';

async function request<T>(url: string, schema: z.ZodType<T>, reason?: string): Promise<
  { ok: true; data: T } | { ok: false; message: string }
> {
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (reason !== undefined) {
      const session = await getGoSession();
      if (!session.ok) return { ok: false, message: session.message };
      headers['Content-Type'] = 'application/json';
      headers['X-CSRF-Token'] = session.session.csrfToken;
    }
    const response = await fetch(url, { method: reason === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      cache: 'no-store', headers, ...(reason === undefined ? {} : { body: JSON.stringify({ reason }) }) });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      redirectIfUnauthorized(response.status);
      return { ok: false, message: apiErrorMessage(response.status, payload, '복구 현황을 확인하지 못했어요.') };
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) return { ok: false, message: '복구 현황 응답이 올바르지 않아요.' };
    return { ok: true, data: parsed.data };
  } catch { return { ok: false, message: '복구 서버에 연결하지 못했어요.' }; }
}
export function getRecoveryDashboard() { return request('/api/v1/operator/recovery', recoveryDashboardSchema); }
export function recheckPaymentAttempt(id: string, reason: string) {
  return request(`/api/v1/operator/recovery/${encodeURIComponent(id)}/recheck`, paymentRecoveryRequestSchema, reason);
}

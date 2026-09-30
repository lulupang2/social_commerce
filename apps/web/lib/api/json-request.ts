'use client';

import { z } from 'zod';
import { getGoSession } from '../go-auth/client';
import { redirectIfUnauthorized } from '../go-auth/navigation';
import { apiErrorMessage } from './error-message';

export type JsonResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string };

interface JsonRequestOptions {
  method?: string;
  body?: unknown;
  identity?: { memberId: string; changedMessage: string };
  /** Passive status polls must not interrupt the current screen. */
  background?: boolean;
  /** Preserve endpoints that explicitly allow an empty successful response. */
  allowNoContent?: boolean;
  messages: { http: string; invalid: string; network: string };
}

/** Session lookup remains a raw request in go-auth/client to avoid recursion. */
export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  { method = 'GET', body, identity, background = false, allowNoContent = false, messages }: JsonRequestOptions,
): Promise<JsonResult<T>> {
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method !== 'GET') {
      const session = await getGoSession({ required: true });
      if (!session.ok) return { ok: false, status: session.status ?? 0, message: session.message };
      if (identity?.memberId && session.session.member.id !== identity.memberId) {
        return { ok: false, status: 409, message: identity.changedMessage };
      }
      headers['X-CSRF-Token'] = session.session.csrfToken;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, {
      method, headers, credentials: 'same-origin', cache: 'no-store',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204) {
      return allowNoContent
        ? { ok: true, status: 204, data: undefined as T }
        : { ok: false, status: 204, message: messages.invalid };
    }
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (!background) redirectIfUnauthorized(response.status, method !== 'GET');
      return { ok: false, status: response.status, message: apiErrorMessage(response.status, value, messages.http) };
    }
    const parsed = schema.safeParse(value);
    return parsed.success
      ? { ok: true, status: response.status, data: parsed.data }
      : { ok: false, status: response.status, message: messages.invalid };
  } catch {
    return { ok: false, status: 0, message: messages.network };
  }
}

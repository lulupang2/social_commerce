'use client';

import {
  memberFavoriteResultSchema, memberProfileSchema, updateMemberProfileSchema,
  type MemberProfile, type UpdateMemberProfile,
} from '@icegear/domain';
import { z } from 'zod';
import { getGoSession } from '../go-auth/client';
import { goListingSchema, type GoListing } from './client';

export type PersonalResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function request<T>(url: string, schema: z.ZodType<T>, method = 'GET', body?: unknown, expectedMemberId?: string): Promise<PersonalResult<T>> {
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method !== 'GET') {
      const session = await getGoSession();
      if (!session.ok) return { ok: false, status: session.status ?? 0, message: session.message };
      if (expectedMemberId && session.session.member.id !== expectedMemberId) {
        return { ok: false, status: 409, message: '계정이 변경됐어요. 다시 시도해 주세요.' };
      }
      headers['X-CSRF-Token'] = session.session.csrfToken;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(url, { method, headers, credentials: 'same-origin', cache: 'no-store', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const failure = z.object({ message: z.string().optional() }).safeParse(value);
      return { ok: false, status: response.status, message: failure.success && failure.data.message ? failure.data.message : '회원 요청을 처리하지 못했어요.' };
    }
    const parsed = schema.safeParse(value);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, status: response.status, message: '서버 회원 응답을 확인할 수 없어요.' };
  } catch {
    return { ok: false, status: 0, message: '회원 서버에 연결하지 못했어요. 다시 시도해 주세요.' };
  }
}

export function getMemberProfile(): Promise<PersonalResult<MemberProfile>> {
  return request('/api/v1/me', memberProfileSchema);
}
export function updateMemberProfile(input: UpdateMemberProfile, memberId: string): Promise<PersonalResult<MemberProfile>> {
  const parsed = updateMemberProfileSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve({ ok: false, status: 400, message: '이름과 스포츠 실력을 확인해 주세요.' });
  return request('/api/v1/me', memberProfileSchema, 'PUT', parsed.data, memberId);
}
export function setGoFavorite(id: string, favorite: boolean, memberId: string) {
  return request(`/api/v1/me/favorites/${encodeURIComponent(id)}`, memberFavoriteResultSchema, favorite ? 'PUT' : 'DELETE', undefined, memberId);
}
const personalListingsSchema = z.object({ items: z.array(goListingSchema) }).strict();
export async function listPersonalListings(kind: 'listings' | 'favorites'): Promise<PersonalResult<GoListing[]>> {
  const result = await request(`/api/v1/me/${kind}`, personalListingsSchema);
  return result.ok ? { ok: true, data: result.data.items } : result;
}

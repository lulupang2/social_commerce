'use client';

import { z } from 'zod';
import { requestJson } from '../api/json-request';
import { goListingSchema } from './client';

const reviewEventSchema = z.object({
  id: z.number().int(), listingId: z.string().uuid(), actorMemberId: z.string().uuid(),
  fromStatus: z.enum(['pending_review', 'rejected']),
  toStatus: z.enum(['active', 'rejected', 'pending_review']),
  reason: z.string().nullable(), createdAt: z.string().datetime({ offset: true }),
}).strict();
const availabilitySchema = z.object({ purchasable: z.boolean(), reason: z.enum(['available', 'not_public', 'not_prepared', 'sold_out']) }).strict();
export type ReviewEvent = z.infer<typeof reviewEventSchema>;
export type ListingAvailability = z.infer<typeof availabilitySchema>;
type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function request<T>(path: string, schema: z.ZodType<T>, method = 'GET', body?: unknown): Promise<Result<T>> {
  const result = await requestJson(path, schema, {
    method, body,
    messages: {
      http: '검토 서버 요청에 실패했어요.',
      invalid: '검토 서버 응답을 확인할 수 없어요.',
      network: '검토 서버에 연결하지 못했어요.',
    },
  });
  return result.ok ? { ok: true, data: result.data } : result;
}

export function reviewQueue() { return request('/api/v1/reviews', z.object({ items: z.array(goListingSchema) }).strict()); }
export function decideReview(id: string, action: 'approve' | 'reject', reason = '') {
  return request(`/api/v1/reviews/${encodeURIComponent(id)}/${action}`, goListingSchema, 'POST', action === 'reject' ? { reason } : undefined);
}
export function resubmitListing(id: string) { return request(`/api/v1/listings/${encodeURIComponent(id)}/resubmit`, goListingSchema, 'POST'); }
export function reviewHistory(id: string) { return request(`/api/v1/listings/${encodeURIComponent(id)}/reviews`, z.object({ items: z.array(reviewEventSchema) }).strict()); }
export function listingAvailability(id: string) { return request(`/api/v1/listings/${encodeURIComponent(id)}/availability`, availabilitySchema); }

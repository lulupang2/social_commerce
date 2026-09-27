'use client';

import { z } from 'zod';
import { goListingSchema } from './client';

const schema = z.object({ items: z.array(z.object({ listing: goListingSchema, reason: z.string().nullable(), score: z.number().int().nonnegative() }).strict()).max(12) }).strict();
export type RecommendationResult = z.infer<typeof schema>['items'];
export async function getRecommendations(): Promise<{ ok: true; items: RecommendationResult } | { ok: false; message: string }> {
  try {
    const response = await fetch('/api/v1/recommendations', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = z.object({ message: z.string().optional() }).safeParse(value);
      return { ok: false, message: parsed.success && parsed.data.message ? parsed.data.message : '추천 장비를 불러오지 못했어요.' };
    }
    const parsed = schema.safeParse(value);
    return parsed.success ? { ok: true, items: parsed.data.items } : { ok: false, message: '추천 장비의 서버 응답을 확인할 수 없어요.' };
  } catch { return { ok: false, message: '추천 서버에 연결하지 못했어요.' }; }
}

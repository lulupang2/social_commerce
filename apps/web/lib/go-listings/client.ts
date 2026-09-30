'use client';

import {
  createListingSchema,
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  surfListingDetailsSchema,
  tennisListingDetailsSchema,
  type CreateListing,
} from '@icegear/domain';
import { z } from 'zod';

import { getGoSession } from '../go-auth/client';
import { apiErrorMessage } from '../api/error-message';
import type { MarketListing } from '../listings/types';
import type { MutationResult } from '../supabase/mutations';
import { signedImageSchema } from './images';

export const goListingSchema = z
  .object({
    id: z.string().uuid(),
    seller: z
      .object({
        id: z.string().uuid(),
        displayName: z.string().nullable(),
      })
      .strict(),
    sport: z.enum(['surf', 'tennis']),
    category: z.enum(LISTING_CATEGORIES),
    title: z.string(),
    description: z.string(),
    priceKrw: z.number().int().nonnegative(),
    condition: z.enum(LISTING_CONDITIONS),
    status: z.enum([
      'draft',
      'pending_review',
      'rejected',
      'active',
      'reserved',
      'sold',
      'archived',
      'removed',
    ]),
    details: z.record(z.unknown()),
    location: z.string(),
    publishedAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    images: z.array(signedImageSchema).max(12),
  })
  .strict();

export type GoListing = z.infer<typeof goListingSchema>;

const goListingListSchema = z.object({
  items: z.array(goListingSchema).max(50),
  nextCursor: z.string().nullable(),
}).strict();

export function toMarketListing(item: GoListing): MarketListing | null {
  const parsedDetails =
    item.sport === 'surf'
      ? surfListingDetailsSchema.safeParse(item.details)
      : tennisListingDetailsSchema.safeParse(item.details);
  if (!parsedDetails.success) return null;

  return {
    id: item.id,
    sellerId: item.seller.id,
    seller: {
      id: item.seller.id,
      handle: null,
      displayName: item.seller.displayName,
      avatarUrl: null,
    },
    sport: {
      id: item.sport,
      slug: item.sport,
      name: item.sport === 'surf' ? '서핑' : '테니스',
      description: null,
    },
    category: item.category,
    condition: item.condition,
    title: item.title,
    description: item.description,
    price: { amount: item.priceKrw, currency: 'KRW' },
    details: parsedDetails.data,
    location: item.location,
    images: item.images.map((image) => ({ ...image, altText: image.altText ?? null })),
    publishedAt: item.publishedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export type GoListingListResult =
  | { ok: true; listings: MarketListing[]; nextCursor: string | null }
  | { ok: false; status: number; message: string };

export async function listGoListings(filters: {
  sport?: string; category?: string; search?: string; location?: string;
  minPrice?: string; maxPrice?: string; sort?: string; cursor?: string; limit?: number;
} = {}): Promise<GoListingListResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  try {
    const response = await fetch(`/api/v1/listings${query ? `?${query}` : ''}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: response.status === 401 ? '로그인 상태를 확인해 주세요.'
          : '매물 서버에 연결하지 못했어요. 다시 시도해 주세요.',
      };
    }
    const parsed = goListingListSchema.safeParse(await response.json());
    if (!parsed.success) return { ok: false, status: response.status, message: '매물 서버 응답을 확인할 수 없어요.' };
    return {
      ok: true,
      listings: parsed.data.items.flatMap((item) => {
        const mapped = toMarketListing(item);
        return mapped ? [mapped] : [];
      }),
      nextCursor: parsed.data.nextCursor,
    };
  } catch {
    return { ok: false, status: 0, message: '매물 서버에 연결하지 못했어요. 다시 시도해 주세요.' };
  }
}

export async function getEditableGoListing(id: string): Promise<GoListing | null> {
  try {
    const response = await fetch('/api/v1/listings/' + encodeURIComponent(id), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const parsed = goListingSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getGoListing(id: string): Promise<MarketListing | null> {
  try {
    const item = await getEditableGoListing(id);
    return item ? toMarketListing(item) : null;
  } catch {
    return null;
  }
}

export async function createGoListing(
  input: CreateListing,
  files: File[],
): Promise<MutationResult<{ id: string; status: 'pending_review' }> | null> {
  const parsed = createListingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'validation_failed',
      message: parsed.error.issues[0]?.message ?? '매물 정보를 다시 확인해 주세요.',
    };
  }

  const session = await getGoSession();
  if (!session.ok) {
    if (session.status === 404 || session.status === undefined) {
      return { ok: false, reason: 'unavailable', message: '매물 서버에 연결하지 못했어요. 입력을 유지하고 다시 시도해 주세요.' };
    }
    if (session.status === 401) {
      return { ok: false, reason: 'unauthenticated', message: '로그인 후 등록할 수 있어요.' };
    }
    return { ok: false, reason: 'unavailable', message: session.message };
  }

  if (files.length > 0) {
    return {
      ok: false,
      reason: 'request_failed',
      message: 'Go 전환 중에는 사진 업로드가 아직 연결되지 않았어요. 사진 없이 먼저 등록해 주세요.',
    };
  }

  const price =
    typeof parsed.data.price === 'number' ? parsed.data.price : parsed.data.price.amount;
  const currency =
    typeof parsed.data.price === 'number'
      ? (parsed.data.currency ?? 'KRW')
      : parsed.data.price.currency;
  if (currency !== 'KRW' || !Number.isSafeInteger(price)) {
    return {
      ok: false,
      reason: 'validation_failed',
      message: '현재 Go 매물 등록은 정수 KRW 가격만 지원해요.',
    };
  }

  const location =
    typeof parsed.data.location === 'string'
      ? parsed.data.location
      : (parsed.data.location?.raw ??
        [parsed.data.location?.region, parsed.data.location?.city].filter(Boolean).join(' '));

  try {
    const response = await fetch('/api/v1/listings', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Token': session.session.csrfToken,
      },
      body: JSON.stringify({
        sport: parsed.data.sport,
        category: parsed.data.category,
        title: parsed.data.title,
        description: parsed.data.description,
        priceKrw: price,
        condition: parsed.data.condition,
        details: parsed.data.details,
        location,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { id?: string; status?: string; message?: string }
      | null;
    if (response.status === 401) {
      return { ok: false, reason: 'unauthenticated', message: '로그인 후 등록할 수 있어요.' };
    }
    if (!response.ok || !data?.id || data.status !== 'pending_review') {
      return {
        ok: false,
        reason: response.status >= 500 ? 'unavailable' : 'request_failed',
        message: apiErrorMessage(response.status, data, '판매글을 저장하지 못했어요.'),
      };
    }
    return { ok: true, data: { id: data.id, status: 'pending_review' } };
  } catch {
    return { ok: false, reason: 'unavailable', message: '등록 응답을 확인하지 못했어요. 내 매물을 확인한 뒤 다시 시도해 주세요.' };
  }
}

export async function updateGoListing(
  id: string,
  input: Partial<{
    category: string;
    title: string;
    description: string;
    priceKrw: number;
    condition: string;
    details: Record<string, unknown>;
    location: string;
  }>,
): Promise<MarketListing | null> {
  const session = await getGoSession();
  if (!session.ok) return null;

  try {
    const response = await fetch('/api/v1/listings/' + encodeURIComponent(id), {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Token': session.session.csrfToken,
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    const parsed = goListingSchema.safeParse(await response.json());
    return parsed.success ? toMarketListing(parsed.data) : null;
  } catch {
    return null;
  }
}

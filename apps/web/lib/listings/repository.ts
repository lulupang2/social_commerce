import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { uuidSchema } from '@icegear/domain';
import { surfListingDetailsSchema, tennisListingDetailsSchema } from '@icegear/domain';

import type { Database } from '../supabase/database.types';
import {
  LISTING_CATEGORIES,
  SPORTS,
  type ListingCategory,
  type ListingFilters,
  type ListingSearchParams,
  type ListingQueryRow,
  type ListingSeller,
  type MarketListing,
  type SportSlug,
} from './types';

export const LISTING_IMAGE_BUCKET = 'listing-images';
export const DEFAULT_LISTING_PAGE_SIZE = 24;

/** Keep the selected shape explicit so relation changes are reviewed with the schema. */
export const LISTING_SELECT =
  'id,seller_id,sport_id,category,title,description,price,currency,condition,status,details,location_text,published_at,created_at,updated_at,sports!inner(id,slug,name,description)' as const;

const signedImageResponseSchema = z
  .object({
    listingId: uuidSchema,
    images: z
      .array(
        z
          .object({
            id: uuidSchema,
            url: z.string().url().startsWith('https://'),
            expiresAt: z.string().datetime({ offset: true }),
            altText: z.string().trim().max(160).nullable(),
            sortOrder: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();

type PublicSellerRow = Database['public']['Views']['public_seller_profiles']['Row'];

export class ListingRepositoryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ListingRepositoryError';
  }
}

export class ListingRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async list(filters: ListingFilters = {}): Promise<MarketListing[]> {
    let query = this.client
      .from('listings')
      .select(LISTING_SELECT)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(DEFAULT_LISTING_PAGE_SIZE);

    if (filters.sport) query = query.eq('sports.slug', filters.sport);
    if (filters.category) query = query.eq('category', filters.category);

    if (filters.search) {
      const search = escapeSearchTerm(filters.search);
      if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      throw new ListingRepositoryError('마켓 매물을 불러오지 못했어요.', { cause: error });
    }

    const rows = (data ?? []) as unknown as ListingQueryRow[];
    const sellerById = await loadSellerSummaries(
      this.client,
      rows.map((row) => row.seller_id),
    );
    return Promise.all(
      rows.map((row) => toMarketListing(row, sellerById.get(row.seller_id) ?? null, this.client)),
    );
  }

  async getById(id: string): Promise<MarketListing | null> {
    const normalizedId = id.trim();
    if (!normalizedId) return null;

    const { data, error } = await this.client
      .from('listings')
      .select(LISTING_SELECT)
      .eq('status', 'active')
      .eq('id', normalizedId)
      .maybeSingle();

    if (error) {
      throw new ListingRepositoryError('매물 정보를 불러오지 못했어요.', { cause: error });
    }
    if (!data) return null;

    const row = data as unknown as ListingQueryRow;
    const sellerById = await loadSellerSummaries(this.client, [row.seller_id]);
    return toMarketListing(row, sellerById.get(row.seller_id) ?? null, this.client);
  }
}

export function parseListingFilters(searchParams: ListingSearchParams): ListingFilters {
  const sportValue = firstSearchParam(searchParams.sport);
  const categoryValue = firstSearchParam(searchParams.category);
  const search = firstSearchParam(searchParams.search)?.trim();
  const filters: ListingFilters = {};

  if (isSportSlug(sportValue)) filters.sport = sportValue;
  if (isListingCategory(categoryValue)) filters.category = categoryValue;
  if (search) filters.search = search;
  return filters;
}

export function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Escape wildcard and OR-expression characters before building a PostgREST filter. */
export function escapeSearchTerm(value: string): string {
  return value
    .trim()
    .replace(/[\\%_]/g, '\\$&')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function isSportSlug(value: string | undefined): value is SportSlug {
  return value !== undefined && (SPORTS as readonly string[]).includes(value);
}

export function isListingCategory(value: string | undefined): value is ListingCategory {
  return value !== undefined && (LISTING_CATEGORIES as readonly string[]).includes(value);
}

export function formatListingLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function loadSellerSummaries(
  client: SupabaseClient<Database>,
  sellerIds: string[],
): Promise<Map<string, ListingSeller>> {
  const uniqueIds = Array.from(new Set(sellerIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await client
    .from('public_seller_profiles')
    .select('id,handle,display_name,avatar_url')
    .in('id', uniqueIds);
  if (error) return new Map();

  const sellers = new Map<string, ListingSeller>();
  for (const row of (data ?? []) as PublicSellerRow[]) {
    if (!row.id) continue;
    sellers.set(row.id, {
      id: row.id,
      handle: row.handle,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    });
  }
  return sellers;
}

async function toMarketListing(
  row: ListingQueryRow,
  seller: ListingSeller | null,
  client: SupabaseClient<Database>,
): Promise<MarketListing> {
  const sportRelation = row.sports;
  const sport = (Array.isArray(sportRelation) ? sportRelation[0] : sportRelation) ?? {
    id: row.sport_id,
    slug: 'unknown',
    name: '알 수 없는 종목',
    description: null,
  };
  const parsedDetails =
    sport.slug === 'surf'
      ? surfListingDetailsSchema.safeParse(row.details)
      : sport.slug === 'tennis'
        ? tennisListingDetailsSchema.safeParse(row.details)
        : null;
  const details = parsedDetails?.success ? parsedDetails.data : {};
  const amount = Number(row.price);

  return {
    id: row.id,
    sellerId: row.seller_id,
    seller,
    sport: {
      id: sport.id,
      slug: sport.slug,
      name: sport.name,
      description: sport.description,
    },
    category: isListingCategory(row.category) ? row.category : 'other',
    condition: row.condition,
    title: row.title,
    description: row.description,
    price: {
      amount: Number.isFinite(amount) ? amount : 0,
      currency: row.currency,
    },
    details,
    location: row.location_text,
    images: await loadSignedImages(row, client),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadSignedImages(
  row: ListingQueryRow,
  client: SupabaseClient<Database>,
): Promise<MarketListing['images']> {
  const { data, error } = await client.functions.invoke<unknown>('sign-listing-images', {
    body: {
      listingId: row.id,
    },
  });
  if (error) return [];
  const parsed = signedImageResponseSchema.safeParse(data);
  if (!parsed.success || parsed.data.listingId !== row.id) return [];

  return parsed.data.images
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((image) => ({
      id: image.id,
      url: image.url,
      altText: image.altText,
      sortOrder: image.sortOrder,
    }));
}

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, ProfileRow, SportRow } from '../supabase/database.types';
import {
  LISTING_CATEGORIES,
  SPORTS,
  type ListingCategory,
  type ListingFilters,
  type ListingSearchParams,
  type ListingQueryRow,
  type MarketListing,
  type SportSlug,
} from './types';

export const LISTING_IMAGE_BUCKET = 'listing-images';
export const DEFAULT_LISTING_PAGE_SIZE = 24;

/** Keep the selected shape explicit so relation changes are reviewed with the schema. */
export const LISTING_SELECT =
  'id,seller_id,sport_id,category,title,description,price,currency,condition,status,details,location_text,published_at,created_at,updated_at,sports!inner(id,slug,name,description),listing_images(id,storage_path,alt_text,sort_order),profiles(id,handle,display_name,avatar_url)' as const;

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

    if (filters.sport) {
      query = query.eq('sports.slug', filters.sport);
    }

    if (filters.category) {
      query = query.eq('category', filters.category);
    }

    if (filters.search) {
      const search = escapeSearchTerm(filters.search);
      if (search) {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
      }
    }

    const { data, error } = await query;
    if (error) {
      throw new ListingRepositoryError('Unable to load marketplace listings.', { cause: error });
    }

    return (data ?? []).map((row) =>
      toMarketListing(row as unknown as ListingQueryRow, this.client),
    );
  }

  async getById(id: string): Promise<MarketListing | null> {
    const normalizedId = id.trim();
    if (!normalizedId) {
      return null;
    }

    const { data, error } = await this.client
      .from('listings')
      .select(LISTING_SELECT)
      .eq('status', 'active')
      .eq('id', normalizedId)
      .maybeSingle();

    if (error) {
      throw new ListingRepositoryError('Unable to load this marketplace listing.', {
        cause: error,
      });
    }

    return data ? toMarketListing(data as unknown as ListingQueryRow, this.client) : null;
  }
}

export function parseListingFilters(searchParams: ListingSearchParams): ListingFilters {
  const sportValue = firstSearchParam(searchParams.sport);
  const categoryValue = firstSearchParam(searchParams.category);
  const search = firstSearchParam(searchParams.search)?.trim();
  const filters: ListingFilters = {};

  if (isSportSlug(sportValue)) {
    filters.sport = sportValue;
  }
  if (isListingCategory(categoryValue)) {
    filters.category = categoryValue;
  }
  if (search) {
    filters.search = search;
  }

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

function toMarketListing(row: ListingQueryRow, client: SupabaseClient<Database>): MarketListing {
  const sport = firstRelation(row.sports) ?? {
    id: row.sport_id,
    slug: 'unknown',
    name: 'Unknown sport',
    description: null,
  };
  const profile = firstRelation(row.profiles);
  const details = isRecord(row.details) ? row.details : {};

  return {
    id: row.id,
    sellerId: row.seller_id,
    seller: profile ? toSeller(profile) : null,
    sport: toSport(sport),
    category: row.category,
    condition: row.condition,
    title: row.title,
    description: row.description,
    price: {
      amount: toNumber(row.price),
      currency: row.currency,
    },
    details,
    location: row.location_text,
    images: toImages(row.listing_images, client),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function firstRelation<T>(relation: T | T[] | null | undefined): T | null {
  return Array.isArray(relation) ? (relation[0] ?? null) : (relation ?? null);
}

function toSport(
  sport: Pick<SportRow, 'id' | 'slug' | 'name' | 'description'>,
): MarketListing['sport'] {
  return {
    id: sport.id,
    slug: sport.slug,
    name: sport.name,
    description: sport.description,
  };
}

function toSeller(profile: ProfileRow): NonNullable<MarketListing['seller']> {
  return {
    id: profile.id,
    handle: profile.handle,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
  };
}

function toImages(
  relation: ListingQueryRow['listing_images'],
  client: SupabaseClient<Database>,
): MarketListing['images'] {
  const images = Array.isArray(relation) ? relation : relation ? [relation] : [];

  return images
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((image) => ({
      id: image.id,
      url: toPublicImageUrl(image.storage_path, client),
      altText: image.alt_text,
      sortOrder: image.sort_order,
    }));
}

function toPublicImageUrl(path: string, client: SupabaseClient<Database>): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return client.storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl || path;
}

function toNumber(value: number | string): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import {
  createListingSchema,
  listingCategorySchema,
  listingConditionSchema,
  listingStatusSchema,
  sportSchema,
  type CreateListingPayload,
  type Listing,
  type ListingCategory,
  type ListingCondition,
  type ListingStatus,
  type ListingImage,
} from '@icegear/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '../supabase/client';

const LISTING_SELECT =
  'id,seller_id,sport_id,category,title,description,price,currency,condition,status,details,location_text,created_at,updated_at,sports!inner(slug),listing_images(storage_path,alt_text,sort_order)';
const LISTING_IMAGE_BUCKET = 'listing-images';

type ListingImageRow = {
  storage_path: string;
  alt_text?: string | null;
  sort_order?: number | null;
};

type ListingRow = {
  id: string;
  seller_id: string;
  sport_id?: string | null;
  category: string;
  title: string;
  description?: string | null;
  price: number | string;
  currency?: string | null;
  condition: string;
  status: string;
  details?: unknown;
  location_text?: string | null;
  created_at: string;
  updated_at: string;
  sports?: { slug?: string | null } | Array<{ slug?: string | null }> | null;
  listing_images?: ListingImageRow[] | null;
};

export type ListingRepositoryErrorCode =
  | 'not_configured'
  | 'validation_error'
  | 'unauthenticated'
  | 'not_found'
  | 'request_failed'
  | 'mapping_failed';

export interface ListingRepositoryError {
  code: ListingRepositoryErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
}

export type ListingRepositoryResult<T> =
  { data: T; error: null } | { data: null; error: ListingRepositoryError };

export interface ListingRepository {
  listActive(): Promise<ListingRepositoryResult<Listing[]>>;
  getActiveById(id: string): Promise<ListingRepositoryResult<Listing>>;
  create(payload: CreateListingPayload): Promise<ListingRepositoryResult<Listing>>;
}

function success<T>(data: T): ListingRepositoryResult<T> {
  return { data, error: null };
}

function failure<T>(error: ListingRepositoryError): ListingRepositoryResult<T> {
  return { data: null, error };
}

function safeRequestError(): ListingRepositoryError {
  return {
    code: 'request_failed',
    message: 'The marketplace could not be reached. Try again shortly.',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSportSlug(row: ListingRow): string | undefined {
  const relation = Array.isArray(row.sports) ? row.sports[0] : row.sports;
  return relation?.slug ?? undefined;
}

function toPublicImageUrl(path: string, client: SupabaseClient): string {
  if (/^https?:\/\//i.test(path)) return path;

  try {
    return client.storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl || path;
  } catch {
    return path;
  }
}

function mapImages(
  rows: ListingImageRow[] | null | undefined,
  client: SupabaseClient,
): ListingImage[] {
  return (rows ?? [])
    .filter((row) => typeof row.storage_path === 'string' && row.storage_path.trim().length > 0)
    .slice()
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
    .map((row, index) => ({
      url: toPublicImageUrl(row.storage_path, client),
      ...(row.alt_text ? { altText: row.alt_text } : {}),
      sortOrder: row.sort_order ?? index,
    }));
}

function mapListingRow(row: ListingRow, client: SupabaseClient): Listing {
  const parsedSport = sportSchema.parse(getSportSlug(row));
  const category = listingCategorySchema.parse(row.category) as ListingCategory;
  const condition = listingConditionSchema.parse(row.condition) as ListingCondition;
  const status = listingStatusSchema.parse(row.status) as ListingStatus;
  const amount = typeof row.price === 'number' ? row.price : Number(row.price);

  if (!Number.isFinite(amount)) {
    throw new Error('Listing price is invalid');
  }

  const details = isRecord(row.details) ? row.details : {};
  const rawTags = details.tags;
  const tags = Array.isArray(rawTags)
    ? rawTags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    : undefined;
  const location = row.location_text?.trim() || undefined;
  const core = {
    id: row.id,
    sellerId: row.seller_id,
    category,
    status,
    condition,
    title: row.title,
    description: row.description ?? '',
    price: {
      amount,
      currency: (row.currency ?? 'USD').toUpperCase(),
    },
    images: mapImages(row.listing_images, client),
    ...(location ? { location } : {}),
    ...(tags?.length ? { tags } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (parsedSport === 'ski') {
    return { ...core, sport: 'ski', details } as Listing;
  }

  return { ...core, sport: 'hockey', details } as Listing;
}

function formatValidationErrors(
  issues: Array<{ path: (string | number)[]; message: string }>,
): ListingRepositoryError {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path.length ? issue.path.join('.') : 'form';
    fieldErrors[field] ??= issue.message;
  }

  return {
    code: 'validation_error',
    message: 'Check the listing details and try again.',
    fieldErrors,
  };
}

function serializeLocation(location: CreateListingPayload['location']): string | null {
  if (typeof location === 'string') {
    return location.trim() || null;
  }

  if (!location) {
    return null;
  }

  const parts = [location.city, location.region, location.countryCode, location.postalCode]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());

  return parts.length ? parts.join(', ') : null;
}

function getPriceAndCurrency(payload: CreateListingPayload): { amount: number; currency: string } {
  if (typeof payload.price === 'number') {
    return {
      amount: payload.price,
      currency: (payload.currency ?? 'USD').toUpperCase(),
    };
  }

  return {
    amount: payload.price.amount,
    currency: (payload.currency ?? payload.price.currency).toUpperCase(),
  };
}

function buildDetails(payload: CreateListingPayload): Record<string, unknown> {
  const details = isRecord(payload.details) ? { ...payload.details } : {};

  if (payload.tags !== undefined) details.tags = payload.tags;
  if (payload.isNegotiable !== undefined) details.isNegotiable = payload.isNegotiable;
  if (payload.shippingAvailable !== undefined)
    details.shippingAvailable = payload.shippingAvailable;
  if (payload.localPickupAvailable !== undefined) {
    details.localPickupAvailable = payload.localPickupAvailable;
  }

  return details;
}

function buildImageRows(payload: CreateListingPayload): ListingImageRow[] {
  return (payload.images ?? []).map((image, index) => {
    if (typeof image === 'string') {
      return { storage_path: image, sort_order: index };
    }

    return {
      storage_path: image.url,
      alt_text: image.altText ?? null,
      sort_order: image.sortOrder ?? index,
    };
  });
}

function configuredClient(
  client: SupabaseClient | null,
): { client: SupabaseClient; error: null } | { client: null; error: ListingRepositoryError } {
  return client
    ? { client, error: null }
    : {
        client: null,
        error: {
          code: 'not_configured',
          message: 'Connect Supabase to browse or publish marketplace listings.',
        },
      };
}

export function createListingRepository(
  client: SupabaseClient | null = supabase,
): ListingRepository {
  async function listActive(): Promise<ListingRepositoryResult<Listing[]>> {
    const configured = configuredClient(client);
    if (!configured.client) return failure(configured.error);

    const { data, error } = await configured.client
      .from('listings')
      .select(LISTING_SELECT)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) return failure(safeRequestError());

    try {
      return success(
        ((data ?? []) as ListingRow[]).map((row) => mapListingRow(row, configured.client)),
      );
    } catch {
      return failure({
        code: 'mapping_failed',
        message: 'Some listings could not be displayed. Try again shortly.',
      });
    }
  }

  async function getActiveById(id: string): Promise<ListingRepositoryResult<Listing>> {
    const configured = configuredClient(client);
    if (!configured.client) return failure(configured.error);

    const normalizedId = id.trim();
    if (!normalizedId) {
      return failure({ code: 'not_found', message: 'Listing not found.' });
    }

    const { data, error } = await configured.client
      .from('listings')
      .select(LISTING_SELECT)
      .eq('id', normalizedId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) return failure(safeRequestError());
    if (!data) return failure({ code: 'not_found', message: 'Listing not found.' });

    try {
      return success(mapListingRow(data as ListingRow, configured.client));
    } catch {
      return failure({
        code: 'mapping_failed',
        message: 'This listing could not be displayed. Try again shortly.',
      });
    }
  }

  async function create(payload: CreateListingPayload): Promise<ListingRepositoryResult<Listing>> {
    const configured = configuredClient(client);
    if (!configured.client) return failure(configured.error);

    const parsed = createListingSchema.safeParse(payload);
    if (!parsed.success) return failure(formatValidationErrors(parsed.error.issues));

    const { data: authData, error: authError } = await configured.client.auth.getUser();
    if (authError || !authData.user) {
      return failure({
        code: 'unauthenticated',
        message: 'Sign in before creating a listing.',
      });
    }

    const { data: sport, error: sportError } = await configured.client
      .from('sports')
      .select('id')
      .eq('slug', parsed.data.sport)
      .eq('is_active', true)
      .maybeSingle();

    if (sportError || !sport) {
      return failure({
        code: 'request_failed',
        message: 'The selected sport is not available right now.',
      });
    }

    const { amount, currency } = getPriceAndCurrency(parsed.data);
    const imageRows = buildImageRows(parsed.data);
    const listingInsert = {
      seller_id: authData.user.id,
      sport_id: sport.id,
      category: parsed.data.category,
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      price: amount,
      currency,
      condition: parsed.data.condition,
      status: 'draft',
      details: buildDetails(parsed.data),
      location_text: serializeLocation(parsed.data.location),
    };

    const { data: created, error: createError } = await configured.client
      .from('listings')
      .insert(listingInsert)
      .select(LISTING_SELECT)
      .single();

    if (createError || !created) return failure(safeRequestError());

    if (imageRows.length) {
      const { error: imageError } = await configured.client.from('listing_images').insert(
        imageRows.map((image) => ({
          listing_id: created.id,
          storage_path: image.storage_path,
          alt_text: image.alt_text ?? null,
          sort_order: image.sort_order ?? 0,
        })),
      );

      if (imageError) {
        return failure({
          code: 'request_failed',
          message: 'The listing was saved, but its images could not be attached.',
        });
      }
    }

    const createdRow = {
      ...(created as ListingRow),
      sports: (created as ListingRow).sports ?? { slug: parsed.data.sport },
      listing_images: imageRows,
    } as ListingRow;

    try {
      return success(mapListingRow(createdRow, configured.client));
    } catch {
      return failure({
        code: 'mapping_failed',
        message: 'The listing was saved but could not be displayed.',
      });
    }
  }

  return { listActive, getActiveById, create };
}

export const listingRepository = createListingRepository();

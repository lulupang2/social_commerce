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
import { resolveSignedUrls } from '../media/index.ts';
// Lazy import default supabase client to support Node test execution without polyfill side-effects

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
  sport_id: string;
  category: string;
  title: string;
  description: string | null;
  price: number | string;
  currency: string | null;
  condition: string;
  status: string;
  details?: Record<string, unknown> | null;
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
  fieldErrors?: Record<string, string[]>;
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
    message: 'Marketplace request failed. Check your connection and try again.',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSportSlug(row: ListingRow): string | undefined {
  const relation = Array.isArray(row.sports) ? row.sports[0] : row.sports;
  return relation?.slug ?? undefined;
}

async function mapImagesAsync(
  rows: ListingImageRow[] | null | undefined,
  client: SupabaseClient,
): Promise<ListingImage[]> {
  const validRows = (rows ?? [])
    .filter((row) => typeof row.storage_path === 'string' && row.storage_path.trim().length > 0)
    .slice()
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));

  if (validRows.length === 0) return [];

  const paths = validRows.map((r) => r.storage_path);
  const signedMap = await resolveSignedUrls(client, paths);

  return validRows.map((row, index) => {
    const resolved = signedMap.get(row.storage_path);
    return {
      url: resolved?.signedUrl ?? row.storage_path,
      ...(resolved?.expiresAt ? { expiresAt: resolved.expiresAt } : {}),
      ...(row.alt_text ? { altText: row.alt_text } : {}),
      sortOrder: row.sort_order ?? index,
    };
  });
}

async function mapListingRowAsync(row: ListingRow, client: SupabaseClient): Promise<Listing> {
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

  const images = await mapImagesAsync(row.listing_images, client);

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
    images,
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
  const first = issues[0];
  const field = first?.path.join('.');
  const message = first ? (field ? `${field}: ${first.message}` : first.message) : 'Invalid input';

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.join('.') || 'root';
    if (!fieldErrors[key]) fieldErrors[key] = [];
    fieldErrors[key].push(issue.message);
  }

  return {
    code: 'validation_error',
    message,
    fieldErrors,
  };
}

function serializeLocation(location: CreateListingPayload['location']): string | null {
  if (!location) return null;
  if (typeof location === 'string') {
    const trimmed = location.trim();
    return trimmed.length ? trimmed : null;
  }

  const parts = [location.city, location.region, location.countryCode]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length));

  return parts.length ? parts.join(', ') : null;
}

function getPriceAndCurrency(payload: CreateListingPayload): { amount: number; currency: string } {
  if (typeof payload.price === 'number') {
    return { amount: payload.price, currency: (payload.currency ?? 'USD').toUpperCase() };
  }

  return {
    amount: payload.price.amount,
    currency: payload.price.currency.toUpperCase(),
  };
}

function buildDetails(payload: CreateListingPayload): Record<string, unknown> {
  const {
    sport,
    category,
    title,
    description,
    price,
    condition,
    images,
    location,
    tags,
    ...details
  } = payload;

  return {
    ...details,
    ...(tags?.length ? { tags } : {}),
  };
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

async function resolveClient(
  providedClient?: SupabaseClient | null,
): Promise<
  { client: SupabaseClient; error: null } | { client: null; error: ListingRepositoryError }
> {
  if (providedClient) {
    return { client: providedClient, error: null };
  }
  try {
    const { supabase } = await import('../supabase/client.ts');
    if (supabase) {
      return { client: supabase, error: null };
    }
  } catch {
    // Return unconfigured when client cannot be loaded
  }
  return {
    client: null,
    error: {
      code: 'not_configured',
      message: 'Connect Supabase to browse or publish marketplace listings.',
    },
  };
}

export function createListingRepository(providedClient?: SupabaseClient | null): ListingRepository {
  async function listActive(): Promise<ListingRepositoryResult<Listing[]>> {
    const configured = await resolveClient(providedClient);
    if (!configured.client) return failure(configured.error);

    const { data, error } = await configured.client
      .from('listings')
      .select(LISTING_SELECT)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) return failure(safeRequestError());

    try {
      const listings = await Promise.all(
        ((data ?? []) as ListingRow[]).map((row) => mapListingRowAsync(row, configured.client)),
      );
      return success(listings);
    } catch {
      return failure({
        code: 'mapping_failed',
        message: 'Some listings could not be displayed. Try again shortly.',
      });
    }
  }

  async function getActiveById(id: string): Promise<ListingRepositoryResult<Listing>> {
    const configured = await resolveClient(providedClient);
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
      const listing = await mapListingRowAsync(data as ListingRow, configured.client);
      return success(listing);
    } catch {
      return failure({
        code: 'mapping_failed',
        message: 'This listing could not be displayed. Try again shortly.',
      });
    }
  }

  async function create(payload: CreateListingPayload): Promise<ListingRepositoryResult<Listing>> {
    const configured = await resolveClient(providedClient);
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
        // Roll back created draft listing if images fail to attach
        await configured.client.from('listings').delete().eq('id', created.id);

        return failure({
          code: 'request_failed',
          message: 'The listing could not be created because its images failed to attach.',
        });
      }
    }

    const createdRow = {
      ...(created as ListingRow),
      sports: (created as ListingRow).sports ?? { slug: parsed.data.sport },
      listing_images: imageRows,
    } as ListingRow;

    try {
      const listing = await mapListingRowAsync(createdRow, configured.client);
      return success(listing);
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

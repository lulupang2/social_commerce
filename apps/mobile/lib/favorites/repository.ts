import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '../supabase/client';

const FAVORITES_SELECT = 'listing_id,created_at';
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export type FavoriteRepositoryErrorCode =
  | 'not_configured'
  | 'authentication_required'
  | 'invalid_argument'
  | 'request_failed'
  | 'mapping_failed';

export interface FavoriteRepositoryError {
  code: FavoriteRepositoryErrorCode;
  message: string;
}

export type FavoriteRepositoryResult<T> =
  { data: T; error: null } | { data: null; error: FavoriteRepositoryError };

export interface Favorite {
  listingId: string;
  createdAt: string;
}

export interface FavoriteCursor {
  createdAt: string;
  listingId: string;
}

export interface FavoriteListOptions {
  cursor?: FavoriteCursor;
  limit?: number;
}

export interface FavoritePage {
  items: Favorite[];
  nextCursor: FavoriteCursor | null;
}

export interface FavoriteMutationResult {
  listingId: string;
  isFavorite: boolean;
}

export interface FavoriteRepository {
  list(options?: FavoriteListOptions): Promise<FavoriteRepositoryResult<FavoritePage>>;
  isFavorite(listingId: string): Promise<FavoriteRepositoryResult<boolean>>;
  add(listingId: string): Promise<FavoriteRepositoryResult<FavoriteMutationResult>>;
  remove(listingId: string): Promise<FavoriteRepositoryResult<FavoriteMutationResult>>;
  toggle(listingId: string): Promise<FavoriteRepositoryResult<FavoriteMutationResult>>;
}

export interface FavoriteOptimisticMutation {
  operationId: string;
  previousValue: boolean;
  nextValue: boolean;
}

export interface FavoriteOptimisticState {
  values: Readonly<Record<string, boolean>>;
  pendingByListingId: Readonly<Record<string, FavoriteOptimisticMutation>>;
  refetchRequired: boolean;
}

export type FavoriteOptimisticAction =
  | { type: 'hydrate'; values: Readonly<Record<string, boolean>> }
  | { type: 'refetched'; values: Readonly<Record<string, boolean>> }
  | { type: 'begin'; listingId: string; operationId: string; nextValue: boolean }
  | { type: 'commit'; listingId: string; operationId: string }
  | {
      type: 'fail';
      listingId: string;
      operationId: string;
      errorCode: FavoriteRepositoryErrorCode;
    };

type FavoriteRow = {
  listing_id?: unknown;
  created_at?: unknown;
};

type AuthenticatedClient = {
  client: SupabaseClient;
  userId: string;
};

function success<T>(data: T): FavoriteRepositoryResult<T> {
  return { data, error: null };
}

function failure<T>(
  code: FavoriteRepositoryErrorCode,
  message: string,
): FavoriteRepositoryResult<T> {
  return { data: null, error: { code, message } };
}

function requestFailure<T>(): FavoriteRepositoryResult<T> {
  return failure(
    'request_failed',
    '찜 정보를 저장소와 동기화하지 못했어요. 잠시 후 다시 시도해 주세요.',
  );
}

function normalizeListingId(listingId: string): string | null {
  const normalized = listingId.trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function isIsoTimestamp(value: string): boolean {
  return ISO_TIMESTAMP_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

function validPageSize(limit: number | undefined): number | null {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  return Number.isInteger(limit) && limit > 0 && limit <= MAX_PAGE_SIZE ? limit : null;
}

function validCursor(cursor: FavoriteCursor | undefined): cursor is FavoriteCursor {
  if (!cursor) return false;
  return UUID_PATTERN.test(cursor.listingId) && isIsoTimestamp(cursor.createdAt);
}

function mapFavoriteRow(row: FavoriteRow): Favorite | null {
  if (
    typeof row.listing_id !== 'string' ||
    !UUID_PATTERN.test(row.listing_id) ||
    typeof row.created_at !== 'string' ||
    !isIsoTimestamp(row.created_at)
  ) {
    return null;
  }

  return { listingId: row.listing_id, createdAt: row.created_at };
}

function requiresRefetch(code: FavoriteRepositoryErrorCode): boolean {
  return code === 'request_failed' || code === 'mapping_failed';
}

export function createFavoriteOptimisticState(
  favoriteListingIds: readonly string[] = [],
): FavoriteOptimisticState {
  const values: Record<string, boolean> = {};
  for (const listingId of favoriteListingIds) values[listingId] = true;
  return { values, pendingByListingId: {}, refetchRequired: false };
}

export function favoriteOptimisticReducer(
  state: FavoriteOptimisticState,
  action: FavoriteOptimisticAction,
): FavoriteOptimisticState {
  if (action.type === 'hydrate') {
    const values = { ...state.values, ...action.values };
    for (const [listingId, pending] of Object.entries(state.pendingByListingId)) {
      values[listingId] = pending.nextValue;
    }
    return { ...state, values };
  }

  if (action.type === 'refetched') {
    return {
      values: { ...action.values },
      pendingByListingId: {},
      refetchRequired: false,
    };
  }

  if (action.type === 'begin') {
    const existing = state.pendingByListingId[action.listingId];
    if (existing) return state;

    return {
      ...state,
      values: { ...state.values, [action.listingId]: action.nextValue },
      pendingByListingId: {
        ...state.pendingByListingId,
        [action.listingId]: {
          operationId: action.operationId,
          previousValue: Boolean(state.values[action.listingId]),
          nextValue: action.nextValue,
        },
      },
    };
  }

  const pending = state.pendingByListingId[action.listingId];
  if (!pending || pending.operationId !== action.operationId) return state;

  const pendingByListingId = { ...state.pendingByListingId };
  delete pendingByListingId[action.listingId];

  if (action.type === 'commit') {
    return { ...state, pendingByListingId };
  }

  return {
    values: { ...state.values, [action.listingId]: pending.previousValue },
    pendingByListingId,
    refetchRequired: state.refetchRequired || requiresRefetch(action.errorCode),
  };
}

async function authenticatedClient(
  client: SupabaseClient | null,
): Promise<FavoriteRepositoryResult<AuthenticatedClient>> {
  if (!client) {
    return failure('not_configured', 'Supabase 연결이 설정되지 않았어요.');
  }

  try {
    const { data, error } = await client.auth.getSession();
    const userId = data.session?.user.id?.trim();
    if (error || !userId) {
      return failure('authentication_required', '로그인 후 찜을 사용할 수 있어요.');
    }
    return success({ client, userId });
  } catch {
    return failure('authentication_required', '로그인 후 찜을 사용할 수 있어요.');
  }
}

/**
 * Creates a persisted favorites repository. The owner always comes from the
 * active Supabase session; no public method accepts a profile or user id.
 */
export function createFavoriteRepository(
  client: SupabaseClient | null = supabase,
): FavoriteRepository {
  const mutationTails = new Map<string, Promise<void>>();

  async function serializeMutation<T>(
    listingId: string,
    mutation: () => Promise<FavoriteRepositoryResult<T>>,
  ): Promise<FavoriteRepositoryResult<T>> {
    const previous = mutationTails.get(listingId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    mutationTails.set(listingId, tail);

    await previous;
    try {
      return await mutation();
    } catch {
      return requestFailure();
    } finally {
      release?.();
      if (mutationTails.get(listingId) === tail) mutationTails.delete(listingId);
    }
  }

  async function rawIsFavorite(
    authenticated: AuthenticatedClient,
    listingId: string,
  ): Promise<FavoriteRepositoryResult<boolean>> {
    try {
      const { data, error } = await authenticated.client
        .from('favorites')
        .select('listing_id')
        .eq('user_id', authenticated.userId)
        .eq('listing_id', listingId)
        .maybeSingle();
      if (error) return requestFailure();
      return success(Boolean(data));
    } catch {
      return requestFailure();
    }
  }

  async function rawAdd(
    authenticated: AuthenticatedClient,
    listingId: string,
  ): Promise<FavoriteRepositoryResult<FavoriteMutationResult>> {
    try {
      const { error } = await authenticated.client
        .from('favorites')
        .upsert(
          { user_id: authenticated.userId, listing_id: listingId },
          { onConflict: 'user_id,listing_id', ignoreDuplicates: true },
        );
      if (error) return requestFailure();
      return success({ listingId, isFavorite: true });
    } catch {
      return requestFailure();
    }
  }

  async function rawRemove(
    authenticated: AuthenticatedClient,
    listingId: string,
  ): Promise<FavoriteRepositoryResult<FavoriteMutationResult>> {
    try {
      const { error } = await authenticated.client
        .from('favorites')
        .delete()
        .eq('user_id', authenticated.userId)
        .eq('listing_id', listingId);
      if (error) return requestFailure();
      return success({ listingId, isFavorite: false });
    } catch {
      return requestFailure();
    }
  }

  async function list(
    options: FavoriteListOptions = {},
  ): Promise<FavoriteRepositoryResult<FavoritePage>> {
    const limit = validPageSize(options.limit);
    if (!limit || (options.cursor !== undefined && !validCursor(options.cursor))) {
      return failure('invalid_argument', '찜 목록 페이지 조건이 올바르지 않아요.');
    }

    const authenticated = await authenticatedClient(client);
    if (!authenticated.data) return authenticated;

    try {
      let query = authenticated.data.client
        .from('favorites')
        .select(FAVORITES_SELECT)
        .eq('user_id', authenticated.data.userId)
        .order('created_at', { ascending: false })
        .order('listing_id', { ascending: false })
        .limit(limit + 1);

      if (options.cursor) {
        const { createdAt, listingId } = options.cursor;
        query = query.or(
          `created_at.lt.${createdAt},and(created_at.eq.${createdAt},listing_id.lt.${listingId})`,
        );
      }

      const { data, error } = await query;
      if (error) return requestFailure();

      const rows = (data ?? []) as FavoriteRow[];
      const mapped = rows.map(mapFavoriteRow);
      if (mapped.some((favorite) => favorite === null)) {
        return failure('mapping_failed', '찜 목록 응답 형식이 올바르지 않아요.');
      }

      const items = (mapped as Favorite[]).slice(0, limit);
      const last = items.at(-1);
      return success({
        items,
        nextCursor:
          rows.length > limit && last
            ? { createdAt: last.createdAt, listingId: last.listingId }
            : null,
      });
    } catch {
      return requestFailure();
    }
  }

  async function isFavorite(listingId: string): Promise<FavoriteRepositoryResult<boolean>> {
    const normalized = normalizeListingId(listingId);
    if (!normalized) return failure('invalid_argument', '상품 ID가 필요해요.');

    const authenticated = await authenticatedClient(client);
    if (!authenticated.data) return authenticated;
    return rawIsFavorite(authenticated.data, normalized);
  }

  async function add(listingId: string): Promise<FavoriteRepositoryResult<FavoriteMutationResult>> {
    const normalized = normalizeListingId(listingId);
    if (!normalized) return failure('invalid_argument', '상품 ID가 필요해요.');

    return serializeMutation(normalized, async () => {
      const authenticated = await authenticatedClient(client);
      if (!authenticated.data) return authenticated;
      return rawAdd(authenticated.data, normalized);
    });
  }

  async function remove(
    listingId: string,
  ): Promise<FavoriteRepositoryResult<FavoriteMutationResult>> {
    const normalized = normalizeListingId(listingId);
    if (!normalized) return failure('invalid_argument', '상품 ID가 필요해요.');

    return serializeMutation(normalized, async () => {
      const authenticated = await authenticatedClient(client);
      if (!authenticated.data) return authenticated;
      return rawRemove(authenticated.data, normalized);
    });
  }

  async function toggle(
    listingId: string,
  ): Promise<FavoriteRepositoryResult<FavoriteMutationResult>> {
    const normalized = normalizeListingId(listingId);
    if (!normalized) return failure('invalid_argument', '상품 ID가 필요해요.');

    return serializeMutation(normalized, async () => {
      const authenticated = await authenticatedClient(client);
      if (!authenticated.data) return authenticated;

      const membership = await rawIsFavorite(authenticated.data, normalized);
      if (membership.error) return membership;
      return membership.data
        ? rawRemove(authenticated.data, normalized)
        : rawAdd(authenticated.data, normalized);
    });
  }

  return { list, isFavorite, add, remove, toggle };
}

export const favoritesRepository = createFavoriteRepository();

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { listGoListings } from './client';
import type { MarketListing } from '../listings/types';

export type CatalogFilters = {
  sport: string; category: string; search: string; location: string;
  minPrice: string; maxPrice: string; sort: string;
};
export const emptyCatalogFilters: CatalogFilters = {
  sport: '', category: '', search: '', location: '', minPrice: '', maxPrice: '', sort: 'recent',
};
type CatalogState = { key: string; items: MarketListing[]; nextCursor: string | null; loading: boolean; error: string };

export function useCatalog(input: CatalogFilters, enabled: boolean) {
  const key = JSON.stringify(input);
  const filters = useMemo(() => JSON.parse(key) as CatalogFilters, [key]);
  const [state, setState] = useState<CatalogState>({ key: '', items: [], nextCursor: null, loading: false, error: '' });
  const [retryIndex, setRetryIndex] = useState(0);
  const requestKey = `${key}:${retryIndex}`;
  const generation = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const current = ++generation.current;
    void listGoListings(filters).then((result) => {
      if (!active || generation.current !== current) return;
      setState(result.ok
        ? { key: requestKey, items: result.listings, nextCursor: result.nextCursor, loading: false, error: '' }
        : { key: requestKey, items: [], nextCursor: null, loading: false, error: result.message });
    });
    return () => { active = false; generation.current = current + 1; };
  }, [filters, requestKey, enabled]);
  const loadMore = async () => {
    if (!enabled || state.key !== requestKey || state.loading || !state.nextCursor) return;
    const current = generation.current;
    const cursor = state.nextCursor;
    setState((value) => ({ ...value, loading: true, error: '' }));
    const result = await listGoListings({ ...filters, cursor });
    if (generation.current !== current) return;
    setState((value) => result.ok
      ? { key: requestKey, items: [...value.items, ...result.listings], nextCursor: result.nextCursor, loading: false, error: '' }
      : { ...value, loading: false, error: result.message });
  };
  return {
    items: state.key === requestKey ? state.items : [],
    nextCursor: state.key === requestKey ? state.nextCursor : null,
    loading: enabled && (state.key !== requestKey || state.loading),
    error: state.key === requestKey ? state.error : '',
    retry: () => { if (state.items.length && state.nextCursor) void loadMore(); else setRetryIndex((value) => value + 1); }, loadMore,
  };
}

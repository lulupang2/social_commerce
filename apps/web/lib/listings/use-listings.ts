'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { getLocalListings, LOCAL_STORE_EVENT } from '../data/local-store';
import { SUMMER_LISTINGS, type MockListing } from '../data/summer-mock-data';
import { listGoListings } from '../go-listings/client';
import { createBrowserSupabaseClient } from '../supabase/browser';
import { ListingRepository } from './repository';
import type { MarketListing } from './types';

export type ListingDataSource = 'demo' | 'go' | 'supabase';
export type ListingMode = 'server' | 'demo';

interface ListingFeedState {
  listings: MockListing[];
  source: ListingMode;
  isLoading: boolean;
  error: string | null;
  authRequired: boolean;
  retry(): void;
  setMode(mode: ListingMode): void;
}

const CONDITION_LABELS: Record<MarketListing['condition'], string> = {
  new: '새 상품',
  like_new: '거의 새것',
  good: '사용감 있음',
  fair: '사용감 많음',
  poor: '수리 필요',
};

const DETAIL_LABELS: Record<string, string> = {
  brand: '브랜드',
  model: '모델',
  year: '연식',
  size: '사이즈',
  skillLevel: '추천 실력',
  equipmentType: '장비 종류',
  discipline: '보드 타입',
  boardLengthFeet: '보드 길이',
  boardLengthCm: '보드 길이',
  volumeLiters: '부력',
  finSystem: '핀 시스템',
  finIncluded: '핀 포함',
  wetsuitThickness: '웻슈트 두께',
  playStyle: '플레이 스타일',
  handedness: '주 사용 손',
  headSizeSqIn: '헤드 사이즈',
  weightGrams: '무게',
  gripSize: '그립',
  stringPattern: '스트링 패턴',
  strung: '스트링 작업',
};

type RemoteFeed = { listings: MockListing[]; error: string | null; authRequired: boolean };
const LISTING_REFRESH_EVENT = 'summergear:listings-refresh';
let remoteCache: RemoteFeed | null = null;
let remoteRequest: Promise<RemoteFeed> | null = null;
let generation = 0;

export function invalidateListingFeed() {
  generation++;
  remoteCache = null;
  remoteRequest = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LISTING_REFRESH_EVENT));
}

function formatDetailValue(key: string, value: unknown): string | null {
  if (typeof value === 'boolean') return value ? '포함' : '미포함';
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (key === 'boardLengthFeet') return `${value} ft`;
  if (key === 'boardLengthCm') return `${value} cm`;
  if (key === 'volumeLiters') return `${value} L`;
  if (key === 'headSizeSqIn') return `${value} sq.in`;
  if (key === 'weightGrams') return `${value} g`;
  return String(value).replaceAll('_', ' ');
}

function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '최근';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function toMockListing(listing: MarketListing, dataSource: 'go' | 'supabase'): MockListing | null {
  if (listing.sport.slug !== 'surf' && listing.sport.slug !== 'tennis') return null;
  const fallback =
    SUMMER_LISTINGS.find(
      (item) => item.sport === listing.sport.slug && item.category === listing.category,
    ) ?? SUMMER_LISTINGS.find((item) => item.sport === listing.sport.slug);
  if (!fallback) return null;

  const specs: Record<string, string> = {};
  for (const [key, value] of Object.entries(listing.details)) {
    if (key === 'sport' || key === 'notes') continue;
    const displayValue = formatDetailValue(key, value);
    if (displayValue) specs[DETAIL_LABELS[key] ?? key] = displayValue;
  }

  const category: MockListing['category'] =
    listing.category === 'equipment' ||
    listing.category === 'apparel' ||
    listing.category === 'footwear' ||
    listing.category === 'accessories'
      ? listing.category
      : 'accessories';

  return {
    id: listing.id,
    dataSource,
    sellerId: listing.sellerId,
    sport: listing.sport.slug,
    sportLabel: listing.sport.slug === 'surf' ? '서핑' : '테니스',
    category,
    title: listing.title.replace(/^\[데모]\s*/, ''),
    price: listing.price.amount,
    currency: listing.price.currency,
    condition:
      listing.condition === 'new'
        ? 'like_new'
        : listing.condition === 'poor'
          ? 'fair'
          : listing.condition,
    conditionLabel: CONDITION_LABELS[listing.condition],
    location: listing.location ?? '거래 위치 협의',
    seller: {
      name: listing.seller?.displayName ?? listing.seller?.handle ?? 'SummerGear 판매자',
      avatar: listing.seller?.avatarUrl ?? fallback.seller.avatar,
      rating: 4.8,
      transactionCount: 0,
    },
    images: listing.images.map((image) => image.url),
    specs,
    description: listing.description ?? '',
    favoriteCount: 0,
    chatCount: 0,
    createdAt: relativeTime(listing.publishedAt ?? listing.createdAt),
  };
}

async function loadRemoteListings(): Promise<RemoteFeed> {
  if (remoteCache) return remoteCache;
  if (remoteRequest) return remoteRequest;

  const currentGeneration = generation;
  const request = (async () => {
    const go = await listGoListings();
    const client = createBrowserSupabaseClient();
    let legacyError = false;
    const legacy = client
      ? await new ListingRepository(client).list().catch(() => {
          legacyError = true;
          return [];
        })
      : [];
    const sources = [
      ...(go.ok ? go.listings : []).map((listing) => ({ listing, dataSource: 'go' as const })),
      ...legacy.map((listing) => ({ listing, dataSource: 'supabase' as const })),
    ];
    const listings = sources.flatMap(({ listing, dataSource }) => {
      const item = toMockListing(listing, dataSource);
      return item ? [item] : [];
    });
    const result: RemoteFeed = {
      listings,
      error: !go.ok ? go.message : legacyError ? '기존 매물을 불러오지 못했어요. 다시 시도해 주세요.' : null,
      authRequired: !go.ok && go.status === 401,
    };
    if (generation === currentGeneration && !result.error) remoteCache = result;
    return result;
  })();
  remoteRequest = request;
  void request.finally(() => {
    if (remoteRequest === request) remoteRequest = null;
  });
  return request;
}

export function listingIdentity(listing: MockListing): string {
  return `${listing.dataSource ?? (listing.id.startsWith('local-listing-') ? 'local' : 'demo')}:${listing.id}`;
}

export function listingHref(listing: MockListing): string {
  return `/market/${encodeURIComponent(listing.id)}?source=${listing.dataSource ?? (listing.id.startsWith('local-listing-') ? 'local' : 'demo')}`;
}

export function mergeListingFeed(
  local: MockListing[],
  remote: MockListing[],
  demo: MockListing[] = SUMMER_LISTINGS,
): MockListing[] {
  const seen = new Set<string>();
  return [...local, ...remote, ...demo].filter((listing) => {
    const key = listingIdentity(listing);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function useListings(initialMode: ListingMode = 'server'): ListingFeedState {
  const [mode, setMode] = useState<ListingMode>(initialMode);
  const [remote, setRemote] = useState<RemoteFeed | null>(remoteCache);
  const [local, setLocal] = useState<MockListing[]>([]);
  const [isLoading, setIsLoading] = useState(remoteCache === null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const refreshLocal = () => setLocal(getLocalListings());
    const refreshRemote = () => {
      setIsLoading(true);
      setRefresh((value) => value + 1);
    };
    refreshLocal();
    window.addEventListener(LOCAL_STORE_EVENT, refreshLocal);
    window.addEventListener(LISTING_REFRESH_EVENT, refreshRemote);
    return () => {
      window.removeEventListener(LOCAL_STORE_EVENT, refreshLocal);
      window.removeEventListener(LISTING_REFRESH_EVENT, refreshRemote);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (mode !== 'server') return;
    void loadRemoteListings().then((result) => {
      if (!active) return;
      setRemote(result);
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [refresh, mode]);

  const retry = useCallback(() => invalidateListingFeed(), []);
  const listings = useMemo(
    () => mode === 'demo' ? mergeListingFeed(local, [], SUMMER_LISTINGS) : mergeListingFeed([], remote?.listings ?? [], []),
    [local, mode, remote],
  );

  return {
    listings,
    source: mode,
    isLoading: mode === 'server' && isLoading,
    error: mode === 'server' ? remote?.error ?? null : null,
    authRequired: mode === 'server' && (remote?.authRequired ?? false),
    retry,
    setMode,
  };
}

'use client';

import { useEffect, useMemo, useState } from 'react';

import { getLocalListings, LOCAL_STORE_EVENT } from '../data/local-store';
import { SUMMER_LISTINGS, type MockListing } from '../data/summer-mock-data';
import { createBrowserSupabaseClient } from '../supabase/browser';
import { ListingRepository } from './repository';
import type { MarketListing } from './types';

export type ListingDataSource = 'demo' | 'supabase';

interface ListingFeedState {
  listings: MockListing[];
  source: ListingDataSource;
  isLoading: boolean;
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

let remoteCache: MockListing[] | null = null;
let remoteRequest: Promise<MockListing[] | null> | null = null;

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

function toMockListing(listing: MarketListing): MockListing | null {
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
    images: listing.images.length > 0 ? listing.images.map((image) => image.url) : fallback.images,
    specs,
    description: listing.description ?? '',
    recommendationReason:
      listing.sport.slug === 'surf'
        ? '선호 파도와 보드 스펙에 가까운 장비'
        : '선호 플레이 스타일과 라켓 스펙에 가까운 장비',
    favoriteCount: 0,
    chatCount: 0,
    createdAt: relativeTime(listing.publishedAt ?? listing.createdAt),
  };
}

async function loadRemoteListings(): Promise<MockListing[] | null> {
  if (remoteCache) return remoteCache;
  if (remoteRequest) return remoteRequest;

  const client = createBrowserSupabaseClient();
  if (!client) return null;

  remoteRequest = new ListingRepository(client)
    .list()
    .then((listings) => {
      const mapped = listings.flatMap((listing) => {
        const item = toMockListing(listing);
        return item ? [item] : [];
      });
      remoteCache = mapped.length > 0 ? mapped : null;
      return remoteCache;
    })
    .catch(() => null)
    .finally(() => {
      remoteRequest = null;
    });
  return remoteRequest;
}

export function useListings(): ListingFeedState {
  const [remote, setRemote] = useState<MockListing[] | null>(remoteCache);
  const [local, setLocal] = useState<MockListing[]>([]);
  const [isLoading, setIsLoading] = useState(remoteCache === null);

  useEffect(() => {
    const refreshLocal = () => setLocal(getLocalListings());
    refreshLocal();
    window.addEventListener(LOCAL_STORE_EVENT, refreshLocal);

    let active = true;
    void loadRemoteListings().then((listings) => {
      if (!active) return;
      setRemote(listings);
      setIsLoading(false);
    });

    return () => {
      active = false;
      window.removeEventListener(LOCAL_STORE_EVENT, refreshLocal);
    };
  }, []);

  const listings = useMemo(() => {
    const base = remote && remote.length > 0 ? remote : SUMMER_LISTINGS;
    const localIds = new Set(local.map((item) => item.id));
    return [...local, ...base.filter((item) => !localIds.has(item.id))];
  }, [local, remote]);

  return {
    listings,
    source: remote && remote.length > 0 ? 'supabase' : 'demo',
    isLoading,
  };
}

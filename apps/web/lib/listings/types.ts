import type { ListingImageRow, ListingRow, ProfileRow, SportRow } from '../supabase/database.types';
import {
  SPORTS,
  type Sport,
  type SurfListingDetails,
  type TennisListingDetails,
} from '@icegear/domain';

export { SPORTS };
export type SportSlug = Sport;

export const LISTING_CATEGORIES = [
  'equipment',
  'apparel',
  'protective_gear',
  'accessories',
  'parts',
  'other',
] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export const LISTING_CONDITIONS = ['new', 'like_new', 'good', 'fair', 'poor'] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number];

export interface ListingSeller {
  id: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ListingSport {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface ListingImage {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
}

export interface MarketListing {
  id: string;
  sellerId: string;
  seller: ListingSeller | null;
  sport: ListingSport;
  category: ListingCategory;
  condition: ListingCondition;
  title: string;
  description: string | null;
  price: {
    amount: number;
    currency: string;
  };
  details: SurfListingDetails | TennisListingDetails | Record<string, unknown>;
  location: string | null;
  images: ListingImage[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type Relation<T> = T | T[] | null;

/** Shape returned by the nested Supabase select in repository.ts. */
export type ListingQueryRow = ListingRow & {
  sports: Relation<SportRow>;
  listing_images: Relation<ListingImageRow>;
  profiles: Relation<ProfileRow>;
};

export interface ListingFilters {
  sport?: SportSlug;
  search?: string;
  category?: ListingCategory;
}

export type ListingSearchParams = Record<string, string | string[] | undefined>;

import type { MockListing } from './summer-mock-data';

const LISTINGS_KEY = 'summergear:local-listings:v1';
const FAVORITES_KEY = 'summergear:favorites:v1';
export const LOCAL_STORE_EVENT = 'summergear:local-store-change';

function readArray(key: string): unknown[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray(key: string, value: unknown[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(LOCAL_STORE_EVENT, { detail: { key } }));
    return true;
  } catch {
    return false;
  }
}

function isLocalListing(value: unknown): value is MockListing {
  if (!value || typeof value !== 'object') return false;
  const listing = value as Partial<MockListing>;
  return (
    typeof listing.id === 'string' &&
    listing.id.startsWith('local-listing-') &&
    (listing.sport === 'surf' || listing.sport === 'tennis') &&
    typeof listing.title === 'string' &&
    typeof listing.price === 'number' &&
    Number.isFinite(listing.price) &&
    Array.isArray(listing.images)
  );
}


export function getLocalListings(): MockListing[] {
  return readArray(LISTINGS_KEY).filter(isLocalListing).slice(0, 50);
}

export function saveLocalListing(listing: MockListing): boolean {
  const listings = getLocalListings().filter((item) => item.id !== listing.id);
  return writeArray(LISTINGS_KEY, [listing, ...listings].slice(0, 50));
}

export function findLocalListing(id: string): MockListing | null {
  return getLocalListings().find((listing) => listing.id === id) ?? null;
}

export function getFavoriteIds(): string[] {
  return readArray(FAVORITES_KEY).filter(
    (value): value is string => typeof value === 'string' && value.length <= 120,
  );
}

export function setListingFavorite(id: string, favorite: boolean): boolean {
  const favorites = new Set(getFavoriteIds());
  if (favorite) favorites.add(id);
  else favorites.delete(id);
  return writeArray(FAVORITES_KEY, Array.from(favorites).slice(0, 500));
}

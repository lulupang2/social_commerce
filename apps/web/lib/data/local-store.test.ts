import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getFavoriteIds,
  getLocalListings,
  saveLocalListing,
  setListingFavorite,
} from './local-store';
import { SUMMER_LISTINGS } from './summer-mock-data';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test('local demo store persists canonical listings and favorites', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: new MemoryStorage(),
      dispatchEvent() {
        return true;
      },
    },
  });

  try {
    const listing = { ...SUMMER_LISTINGS[0], id: 'local-listing-test' };
    assert.equal(saveLocalListing(listing), true);
    assert.equal(getLocalListings()[0]?.id, listing.id);

    assert.equal(setListingFavorite(listing.id, true), true);
    assert.deepEqual(getFavoriteIds(), [listing.id]);
    assert.equal(setListingFavorite(listing.id, false), true);
    assert.deepEqual(getFavoriteIds(), []);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

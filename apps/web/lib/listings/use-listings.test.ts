import assert from 'node:assert/strict';
import test from 'node:test';

import { SUMMER_LISTINGS, type MockListing } from '../data/summer-mock-data';
import { listGoListings } from '../go-listings/client';
import { FakeListingApi } from '../go-listings/fake-api';
import { listingHref, listingIdentity, mergeListingFeed } from './use-listings';

function listing(id: string, source: 'go' | 'supabase'): MockListing {
  return { ...SUMMER_LISTINGS[0], id, dataSource: source };
}

test('same UUID in Go and legacy stays separate and routes to its own source', () => {
  const go = listing('shared-listing', 'go');
  const legacy = listing('shared-listing', 'supabase');
  assert.deepEqual(mergeListingFeed([], [go, legacy], []), [go, legacy]);
  assert.notEqual(listingIdentity(go), listingIdentity(legacy));
  assert.equal(listingHref(go), '/market/shared-listing?source=go');
  assert.equal(listingHref(legacy), '/market/shared-listing?source=supabase');
});

test('local demo and remote with identical IDs remain distinct, duplicates from one source collapse', () => {
  const local = { ...SUMMER_LISTINGS[0], id: 'same' };
  const remote = listing('same', 'go');
  assert.deepEqual(mergeListingFeed([local], [remote, remote], [local]), [local, remote]);
});

test('Go list preserves empty success, authentication and server failure instead of treating them as demo', async (t) => {
  const api = new FakeListingApi();
  const mocked = t.mock.method(globalThis, 'fetch', api.fetch);
  api.listing.status = 'active';
  assert.deepEqual((await listGoListings()).ok, true);
  mocked.mock.mockImplementation(async () => Response.json({ items: [], nextCursor: null }));
  assert.deepEqual(await listGoListings(), { ok: true, listings: [], nextCursor: null });
  mocked.mock.mockImplementation(async () => new Response(null, { status: 401 }));
  assert.deepEqual(await listGoListings(), { ok: false, status: 401, message: '로그인 상태를 확인해 주세요.' });
  mocked.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  const unavailable = await listGoListings();
  assert.deepEqual(unavailable, { ok: false, status: 503, message: '매물 서버에 연결하지 못했어요. 다시 시도해 주세요.' });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeListingApi } from './fake-api';
import { createGoListing, getEditableGoListing, updateGoListing } from './client';
import { deleteGoListingImage, listGoListingImages, nextGoListingImageSortOrder, uploadGoListingImage } from './images';

const file = new File(['fixture'], 'photo.png', { type: 'image/png' });
const input = { sport: 'surf' as const, category: 'equipment' as const, title: '테스트 보드', description: '사진 등록 흐름을 검증하는 테스트 보드입니다.', price: 100000, currency: 'KRW' as const, condition: 'good' as const, location: '서울', details: { sport: 'surf' as const, brand: 'Test', model: 'Board', discipline: 'shortboard' as const, boardLengthFeet: 6, volumeLiters: 30, finSystem: 'fcs2' as const } };

test('creation preserves successful photos across a partial failure and retry', async (t) => {
  const api = new FakeListingApi(); api.failPutAt = 2; t.mock.method(globalThis, 'fetch', api.fetch);
  const listing = await createGoListing(input, []); assert.ok(listing?.ok);
  const first = await uploadGoListingImage(listing.data.id, file, { sortOrder: 0 }); assert.ok(first.ok);
  const failed = await uploadGoListingImage(listing.data.id, file, { sortOrder: 1 }); assert.ok(!failed.ok);
  let images = await listGoListingImages(listing.data.id); assert.ok(images.ok); assert.deepEqual(images.data.map((image) => image.id), [first.data.imageId]);
  const retry = await uploadGoListingImage(listing.data.id, file, { sortOrder: 1 }); assert.ok(retry.ok);
  images = await listGoListingImages(listing.data.id); assert.ok(images.ok); assert.deepEqual(images.data.map((image) => image.id), [first.data.imageId, retry.data.imageId]);
  assert.equal(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/v1/listings').length, 1);
});

test('full 12-photo edit allows replacement, preserves old image on failure, then deletion and hole refill', async (t) => {
  const api = new FakeListingApi(); api.seed(Array.from({ length: 12 }, (_, index) => index)); t.mock.method(globalThis, 'fetch', api.fetch);
  const original = api.listing.images[0];
  const limited = await uploadGoListingImage(api.listing.id, file, { sortOrder: 0 }); assert.ok(!limited.ok); assert.equal(limited.code, 'IMAGE_LIMIT_EXCEEDED');
  api.storageStatus = 503;
  assert.equal((await uploadGoListingImage(api.listing.id, file, { replaceImageId: original.id })).ok, false);
  assert.equal(api.listing.images[0].id, original.id);
  api.storageStatus = 200;
  const replaced = await uploadGoListingImage(api.listing.id, file, { replaceImageId: original.id }); assert.ok(replaced.ok);
  assert.equal(api.listing.images.length, 12); assert.equal(api.listing.images[0].id, replaced.data.imageId);
  assert.equal((await deleteGoListingImage(api.listing.id, api.listing.images[4].id)).ok, true);
  const refreshed = await listGoListingImages(api.listing.id); assert.ok(refreshed.ok);
  assert.equal(nextGoListingImageSortOrder(refreshed.data), 4);
  assert.equal((await uploadGoListingImage(api.listing.id, file, { sortOrder: 4 })).ok, true);
  const update = await updateGoListing(api.listing.id, { title: '수정한 보드' }); assert.ok(update);
  const reloaded = await getEditableGoListing(api.listing.id); assert.equal(reloaded?.title, '수정한 보드'); assert.equal(reloaded?.images[0].id, replaced.data.imageId);
});

test('nonowners and active listings cannot mutate images', async (t) => {
  const api = new FakeListingApi(); api.seed([0]); t.mock.method(globalThis, 'fetch', api.fetch);
  const original = api.listing.images[0].id;
  api.memberId = '44444444-4444-4444-8444-444444444444';
  assert.equal((await listGoListingImages(api.listing.id)).ok, false);
  assert.equal((await deleteGoListingImage(api.listing.id, original)).ok, false);
  assert.equal((await uploadGoListingImage(api.listing.id, file, { replaceImageId: original })).ok, false);
  api.memberId = api.ownerId; api.listing.status = 'active';
  const active = await uploadGoListingImage(api.listing.id, file, { sortOrder: 1 }); assert.ok(!active.ok); assert.equal(active.status, 409);
  assert.equal((await deleteGoListingImage(api.listing.id, original)).ok, false);
  assert.equal(api.listing.images[0].id, original);
});

test('HTTP failures remain distinguishable and never become empty successful image lists', async (t) => {
  const api = new FakeListingApi(); t.mock.method(globalThis, 'fetch', api.fetch);
  for (const [status, code] of [[401, 'UNAUTHENTICATED'], [404, 'IMAGE_NOT_FOUND'], [409, 'IMAGE_CONFLICT'], [410, 'IMAGE_UPLOAD_EXPIRED'], [503, 'IMAGE_STORAGE_UNAVAILABLE']] as const) {
    api.listStatus = status;
    const result = await listGoListingImages(api.listing.id);
    assert.ok(!result.ok); assert.equal(result.status, status); assert.equal(result.code, code);
  }
});

test('unconfigured or disconnected API never falls back to a fake listing success', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline'); });
  const result = await createGoListing(input, []); assert.ok(result && !result.ok); assert.equal(result.reason, 'unavailable');
  const images = await listGoListingImages('22222222-2222-4222-8222-222222222222'); assert.equal(images.ok, false);
});

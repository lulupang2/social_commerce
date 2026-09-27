import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeListingApi } from './fake-api';
import { uploadGoListingImage, listGoListingImages, isSignedImageExpired } from './images';

const file = new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')], 'photo.png', { type: 'image/png' });

test('image lookup preserves service failures with read-specific recovery guidance', async (t) => {
  for (const code of ['IMAGE_DATABASE_UNAVAILABLE', 'IMAGE_STORAGE_UNAVAILABLE']) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ code, message: 'Unavailable' }, { status: 503 }));
    const result = await listGoListingImages('11111111-1111-4111-8111-111111111111');
    assert.ok(!result.ok);
    assert.equal(result.status, 503);
    assert.equal(result.code, code);
    assert.match(result.message, /매물 사진을 불러오지 못했어요/);
    assert.doesNotMatch(result.message, /입력|저장|로그인/);
    t.mock.restoreAll();
  }
});

test('slot, PUT and complete publish a signed image in its requested hole', async (t) => {
  const api = new FakeListingApi(); api.seed([0, 2]); t.mock.method(globalThis, 'fetch', api.fetch);
  const result = await uploadGoListingImage(api.listing.id, file, { sortOrder: 1 });
  assert.equal(result.ok, true);
  const images = await listGoListingImages(api.listing.id);
  assert.ok(images.ok);
  assert.deepEqual(images.data.map((image) => image.sortOrder), [0, 1, 2]);
  assert.equal(api.slots.size, 0);
});

test('lost complete response is recovered without deleting the ready image', async (t) => {
  const api = new FakeListingApi(); api.loseCompleteResponse = true; t.mock.method(globalThis, 'fetch', api.fetch);
  const result = await uploadGoListingImage(api.listing.id, file, { sortOrder: 0 });
  assert.ok(result.ok);
  assert.equal(api.listing.images[0].id, result.data.imageId);
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 0);
});

test('uncertain complete preserves the slot identity and retries only confirmation', async (t) => {
  const api = new FakeListingApi(); api.loseCompleteResponse = true; api.failListAfterComplete = true;
  t.mock.method(globalThis, 'fetch', api.fetch);
  const failed = await uploadGoListingImage(api.listing.id, file, { sortOrder: 0 });
  assert.ok(!failed.ok); assert.equal(failed.uploadPhase, 'confirm');
  assert.equal(api.calls.filter((call) => call.method === 'DELETE').length, 0);
  api.listStatus = 200;
  const recovered = await uploadGoListingImage(api.listing.id, file, { sortOrder: 0, pendingImageId: failed.pendingImageId, uploadPhase: failed.uploadPhase });
  assert.ok(recovered.ok); assert.equal(recovered.data.imageId, failed.pendingImageId);
  assert.equal(api.calls.filter((call) => call.path.endsWith('/uploads')).length, 1);
  assert.equal(api.calls.filter((call) => call.method === 'PUT').length, 1);
});

test('a dropped complete request can finish on retry without reuploading bytes', async (t) => {
  const api = new FakeListingApi(); api.dropCompleteRequest = true; t.mock.method(globalThis, 'fetch', api.fetch);
  const failed = await uploadGoListingImage(api.listing.id, file, { sortOrder: 0 });
  assert.ok(!failed.ok); assert.equal(failed.uploadPhase, 'confirm');
  const retried = await uploadGoListingImage(api.listing.id, file, { sortOrder: 0, pendingImageId: failed.pendingImageId, uploadPhase: failed.uploadPhase });
  assert.ok(retried.ok); assert.equal(api.listing.images.length, 1);
  assert.equal(api.calls.filter((call) => call.method === 'PUT').length, 1);
});

test('failed PUT cleanup is retained and retried before a fresh upload', async (t) => {
  const api = new FakeListingApi(); api.storageStatus = 503; api.cleanupStatus = 503;
  t.mock.method(globalThis, 'fetch', api.fetch);
  const failed = await uploadGoListingImage(api.listing.id, file, { sortOrder: 0 });
  assert.ok(!failed.ok); assert.equal(failed.uploadPhase, 'cleanup'); assert.equal(api.slots.size, 1);
  api.storageStatus = 200; api.cleanupStatus = 204;
  const retried = await uploadGoListingImage(api.listing.id, file, { sortOrder: 0, pendingImageId: failed.pendingImageId, uploadPhase: failed.uploadPhase });
  assert.ok(retried.ok); assert.equal(api.slots.size, 0); assert.equal(api.listing.images.length, 1);
});

test('expired upload URL is not used; a fresh slot works on retry', async (t) => {
  const api = new FakeListingApi(); api.expireUpload = true; t.mock.method(globalThis, 'fetch', api.fetch);
  const failed = await uploadGoListingImage(api.listing.id, file, { sortOrder: 0 });
  assert.ok(!failed.ok); assert.equal(failed.code, 'IMAGE_UPLOAD_EXPIRED'); assert.equal(failed.status, 410);
  assert.equal(api.calls.filter((call) => call.method === 'PUT').length, 0);
  assert.equal(api.slots.size, 0);
  api.expireUpload = false;
  assert.equal((await uploadGoListingImage(api.listing.id, file, { sortOrder: 0 })).ok, true);
  assert.equal(isSignedImageExpired({ expiresAt: '2026-09-21T00:00:00Z' }, Date.parse('2026-09-21T00:00:00Z')), true);
});

test('storage rejecting a signed token offers renewal rather than service login', async (t) => {
  const api = new FakeListingApi(); api.storageStatus = 403; t.mock.method(globalThis, 'fetch', api.fetch);
  const failed = await uploadGoListingImage(api.listing.id, file, { sortOrder: 0 });
  assert.ok(!failed.ok); assert.equal(failed.code, 'IMAGE_UPLOAD_EXPIRED'); assert.equal(api.slots.size, 0);
});

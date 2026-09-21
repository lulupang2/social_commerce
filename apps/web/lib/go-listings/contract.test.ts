import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getEditableGoListing } from './client';
import { signedImageSchema } from './images';

test('listing responses retain signed images and match OpenAPI', async (t) => {
  const image = {
    id: '11111111-1111-4111-8111-111111111111',
    state: 'signed',
    url: 'https://fixture.invalid/storage/v1/object/sign/image?token=test',
    expiresAt: '2026-09-21T01:00:00Z',
    sortOrder: 0,
  };
  const listing = {
    id: '22222222-2222-4222-8222-222222222222',
    seller: { id: '33333333-3333-4333-8333-333333333333', displayName: null },
    sport: 'surf',
    category: 'equipment',
    title: 'Fixture board',
    description: 'Test',
    priceKrw: 1000,
    condition: 'good',
    status: 'pending_review',
    details: {},
    location: 'fixture',
    publishedAt: null,
    createdAt: '2026-09-21T00:00:00Z',
    updatedAt: '2026-09-21T00:00:00Z',
    images: [image],
  };
  t.mock.method(globalThis, 'fetch', async () => Response.json(listing));
  assert.deepEqual((await getEditableGoListing(listing.id))?.images, [image]);
  const spec = JSON.parse(
    readFileSync(new URL('../../../api/openapi.yaml', import.meta.url), 'utf8'),
  );
  assert.ok(spec.components.schemas.Listing.required.includes('images'));
  assert.equal(
    spec.components.schemas.Listing.properties.images.items.$ref,
    '#/components/schemas/SignedListingImage',
  );
  assert.equal(signedImageSchema.safeParse({ ...image, storagePath: 'private' }).success, false);
});

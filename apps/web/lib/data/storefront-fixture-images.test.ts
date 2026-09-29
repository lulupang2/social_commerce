import assert from 'node:assert/strict';
import test from 'node:test';

import { toMarketListing } from '../go-listings/client';
import { FakeListingApi } from '../go-listings/fake-api';
import { toMockListing } from '../listings/use-listings';
import { storefrontFixtureImage, storefrontListingImages } from './storefront-fixture-images';

const fixture = {
  id: '93000000-3000-4000-8000-000000000001',
  sellerId: '93000000-1000-4000-8000-000000000001',
  dataSource: 'go',
};

test('all 16 registered fixture and seller pairs have distinct illustrations', () => {
  const images = new Set<string>();
  for (let number = 1; number <= 16; number++) {
    const listing = {
      ...fixture,
      id: `93000000-3000-4000-8000-${String(number).padStart(12, '0')}`,
      sellerId: `93000000-1000-4000-8000-00000000000${number % 2 === 1 ? 1 : 2}`,
    };
    const image = storefrontFixtureImage(listing);
    assert.equal(image, `/images/storefront/catalog-${String(number).padStart(2, '0')}.webp`);
    assert.deepEqual(storefrontListingImages(listing, []), [image]);
    images.add(image!);
    assert.equal(
      storefrontFixtureImage({
        ...listing,
        sellerId:
          number % 2 === 1
            ? '93000000-1000-4000-8000-000000000002'
            : '93000000-1000-4000-8000-000000000001',
      }),
      null,
    );
  }
  assert.equal(images.size, 16);
});

test('ordinary IDs, near matches, other owners and other sources retain empty images', () => {
  const excluded = [
    ...['000', '017', '101'].map((suffix) => ({
      ...fixture,
      id: `93000000-3000-4000-8000-000000000${suffix}`,
    })),
    { ...fixture, id: `${fixture.id}0` },
    { ...fixture, id: '94000000-3000-4000-8000-000000000001' },
    { ...fixture, sellerId: undefined },
    { ...fixture, sellerId: '33333333-3333-4333-8333-333333333333' },
    ...['supabase', 'demo', 'local', undefined].map((dataSource) => ({ ...fixture, dataSource })),
  ];
  for (const listing of excluded) {
    const empty: string[] = [];
    assert.equal(storefrontFixtureImage(listing), null);
    assert.equal(storefrontListingImages(listing, empty), empty);
  }
});

test('real images keep precedence, order and identity for every source', () => {
  const images = [
    'https://storage.fixture.invalid/first?token=test',
    'https://storage.fixture.invalid/second?token=test',
  ];
  for (const dataSource of ['go', 'supabase', 'demo', undefined]) {
    assert.equal(storefrontListingImages({ ...fixture, dataSource }, images), images);
  }
});

test('listing mapping uses illustrations only for eligible empty Go images and preserves real API images', () => {
  const api = new FakeListingApi();
  api.listing.id = fixture.id;
  api.listing.seller.id = fixture.sellerId;
  const empty = toMarketListing(api.listing)!;
  assert.deepEqual(toMockListing(empty, 'go')?.images, ['/images/storefront/catalog-01.webp']);
  assert.deepEqual(toMockListing(empty, 'supabase')?.images, []);
  assert.deepEqual(toMockListing({ ...empty, id: 'ordinary-listing' }, 'go')?.images, []);
  api.seed([0, 1]);
  const populated = toMarketListing(api.listing)!;
  assert.deepEqual(
    toMockListing(populated, 'go')?.images,
    api.listing.images.map((image) => image.url),
  );
  assert.deepEqual(populated.images, api.listing.images);
});

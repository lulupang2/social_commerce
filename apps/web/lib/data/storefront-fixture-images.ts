interface ListingIdentity {
  id: string;
  sellerId?: string;
  dataSource?: string;
}

// Static illustrations belong only to the registered storefront test fixtures.
// They are presentation assets, never signed API images or uploaded seller photos.
const fixtureImages = new Map<string, { sellerId: string; image: string }>(
  Array.from({ length: 16 }, (_, index) => {
    const number = index + 1;
    return [
      `93000000-3000-4000-8000-${String(number).padStart(12, '0')}`,
      {
        sellerId: `93000000-1000-4000-8000-00000000000${number % 2 === 1 ? 1 : 2}`,
        image: `/images/storefront/catalog-${String(number).padStart(2, '0')}.webp`,
      },
    ] as const;
  }),
);

export function storefrontFixtureImage(listing: ListingIdentity): string | null {
  if (listing.dataSource !== 'go') return null;
  const fixture = fixtureImages.get(listing.id);
  return fixture && fixture.sellerId === listing.sellerId ? fixture.image : null;
}

// Call only with images from a successful listing/image response. Failures must
// retain their existing error state and retry flow rather than becoming artwork.
export function storefrontListingImages(listing: ListingIdentity, images: string[]): string[] {
  if (images.length > 0) return images;
  const fixtureImage = storefrontFixtureImage(listing);
  return fixtureImage ? [fixtureImage] : images;
}

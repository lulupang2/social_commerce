import Image from 'next/image';
import Link from 'next/link';

import { createServerSupabaseClient } from '../../lib/supabase/server';
import {
  formatListingLabel,
  ListingRepository,
  parseListingFilters,
} from '../../lib/listings/repository';
import { LISTING_CATEGORIES, SPORTS, type ListingSearchParams } from '../../lib/listings/types';
import type { MarketListing } from '../../lib/listings/types';

export const dynamic = 'force-dynamic';

type MarketPageProps = {
  searchParams?: Promise<ListingSearchParams>;
};

export default async function MarketPage({ searchParams }: MarketPageProps) {
  const filters = parseListingFilters((await searchParams) ?? {});
  const client = await createServerSupabaseClient();

  if (!client) {
    return (
      <main className="market-shell">
        <MarketHeader />
        <MarketplaceState
          title="Marketplace setup is required"
          message="Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to apps/web/.env.local to load active listings."
        />
      </main>
    );
  }

  let listings: MarketListing[] = [];
  let loadError = false;

  try {
    listings = await new ListingRepository(client).list(filters);
  } catch {
    loadError = true;
  }

  return (
    <main className="market-shell">
      <MarketHeader />
      <section className="market-intro">
        <div>
          <p className="eyebrow">Marketplace</p>
          <h1>Find your next setup.</h1>
          <p className="lede">
            Browse active ski and hockey gear listings from the IceGear community.
          </p>
        </div>
        <Link className="button button-secondary" href="/">
          Home
        </Link>
      </section>

      <form className="market-filters" method="get">
        <label>
          Search
          <input
            name="search"
            type="search"
            placeholder="Search listings"
            defaultValue={filters.search ?? ''}
          />
        </label>
        <label>
          Sport
          <select name="sport" defaultValue={filters.sport ?? ''}>
            <option value="">All sports</option>
            {SPORTS.map((sport) => (
              <option key={sport} value={sport}>
                {formatListingLabel(sport)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select name="category" defaultValue={filters.category ?? ''}>
            <option value="">All categories</option>
            {LISTING_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {formatListingLabel(category)}
              </option>
            ))}
          </select>
        </label>
        <button className="button" type="submit">
          Apply filters
        </button>
      </form>

      {loadError ? (
        <MarketplaceState
          title="Listings are temporarily unavailable"
          message="Check the Supabase project connection and try again."
        />
      ) : listings.length === 0 ? (
        <MarketplaceState
          title="No active listings yet"
          message={
            filters.search || filters.sport || filters.category
              ? 'Try clearing a filter or searching for another item.'
              : 'Check back soon for new gear.'
          }
        />
      ) : (
        <section aria-label="Active listings" className="listing-grid">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </section>
      )}
    </main>
  );
}

function MarketHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        IceGear
      </Link>
      <span className="config-status">Public marketplace</span>
    </header>
  );
}

function ListingCard({ listing }: { listing: MarketListing }) {
  const image = listing.images[0];
  const seller = listing.seller?.displayName ?? listing.seller?.handle ?? 'IceGear seller';

  return (
    <article className="listing-card">
      <Link className="listing-card-link" href={`/market/${listing.id}`}>
        <div className="listing-image-frame">
          {image ? (
            <Image
              alt={image.altText ?? listing.title}
              className="listing-image"
              height={360}
              src={image.url}
              unoptimized
              width={480}
            />
          ) : (
            <span className="image-placeholder">No image</span>
          )}
        </div>
        <div className="listing-card-body">
          <p className="listing-meta">
            {listing.sport.name} · {formatListingLabel(listing.category)}
          </p>
          <h2>{listing.title}</h2>
          <p className="listing-price">
            {formatPrice(listing.price.amount, listing.price.currency)}
          </p>
          <p className="listing-meta">
            {formatListingLabel(listing.condition)} · {seller}
          </p>
        </div>
      </Link>
    </article>
  );
}

function MarketplaceState({ title, message }: { title: string; message: string }) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}

export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-US')}`;
  }
}

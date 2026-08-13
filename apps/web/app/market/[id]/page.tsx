import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatListingLabel, ListingRepository } from '../../../lib/listings/repository';
import type { MarketListing } from '../../../lib/listings/types';
import { createServerSupabaseClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

type ListingPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const { id } = await params;
  const client = await createServerSupabaseClient();

  if (!client) {
    return { title: 'Marketplace setup required | IceGear' };
  }

  try {
    const listing = await new ListingRepository(client).getById(id);
    if (!listing) {
      return { title: 'Listing not found | IceGear' };
    }

    return {
      title: `${listing.title} | IceGear Marketplace`,
      description: listing.description ?? `${listing.sport.name} gear listed on IceGear.`,
    };
  } catch {
    return { title: 'Marketplace | IceGear' };
  }
}

export default async function ListingPage({ params }: ListingPageProps) {
  const { id } = await params;
  const client = await createServerSupabaseClient();

  if (!client) {
    return (
      <main className="market-shell">
        <Link className="back-link" href="/market">
          ← Back to marketplace
        </Link>
        <section className="empty-state">
          <h1>Marketplace setup is required</h1>
          <p>Add the public Supabase environment variables to load listing details.</p>
        </section>
      </main>
    );
  }

  let listing: MarketListing | null;
  try {
    listing = await new ListingRepository(client).getById(id);
  } catch {
    listing = null;
  }

  if (!listing) {
    notFound();
  }

  return (
    <main className="market-shell">
      <Link className="back-link" href="/market">
        ← Back to marketplace
      </Link>
      <article className="listing-detail">
        <ListingGallery listing={listing} />
        <div className="listing-detail-copy">
          <p className="eyebrow">
            {listing.sport.name} · {formatListingLabel(listing.category)}
          </p>
          <h1>{listing.title}</h1>
          <p className="detail-price">
            {formatPrice(listing.price.amount, listing.price.currency)}
          </p>
          <dl className="listing-summary">
            <div>
              <dt>Seller</dt>
              <dd>{sellerLabel(listing)}</dd>
            </div>
            <div>
              <dt>Condition</dt>
              <dd>{formatListingLabel(listing.condition)}</dd>
            </div>
            {listing.location ? (
              <div>
                <dt>Location</dt>
                <dd>{listing.location}</dd>
              </div>
            ) : null}
          </dl>

          <section className="detail-section">
            <h2>Description</h2>
            <p className="detail-description">
              {listing.description || 'No description provided.'}
            </p>
          </section>

          <section className="detail-section">
            <h2>{listing.sport.name} details</h2>
            <dl className="listing-details">
              {Object.entries(listing.details).map(([key, value]) => {
                const formattedValue = formatDetailValue(value);
                return formattedValue ? (
                  <div key={key}>
                    <dt>{formatListingLabel(key)}</dt>
                    <dd>{formattedValue}</dd>
                  </div>
                ) : null;
              })}
            </dl>
          </section>

          <p className="listing-metadata">
            Listed {formatDate(listing.publishedAt ?? listing.createdAt)} · Listing ID {listing.id}
          </p>
        </div>
      </article>
    </main>
  );
}

function ListingGallery({ listing }: { listing: MarketListing }) {
  return (
    <section aria-label="Listing images" className="detail-gallery">
      {listing.images.length > 0 ? (
        listing.images.map((image) => (
          <Image
            key={image.id}
            alt={image.altText ?? listing.title}
            className="detail-image"
            height={640}
            src={image.url}
            unoptimized
            width={840}
          />
        ))
      ) : (
        <div className="detail-image image-placeholder">No images provided</div>
      )}
    </section>
  );
}

function sellerLabel(listing: MarketListing): string {
  return listing.seller?.displayName ?? listing.seller?.handle ?? listing.sellerId;
}

function formatPrice(amount: number, currency: string): string {
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

function formatDetailValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

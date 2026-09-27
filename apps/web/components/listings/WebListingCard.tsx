'use client';

import { Heart, MapPin } from 'lucide-react';
import { ListingImage } from '@/components/media/ListingImage';
import Link from 'next/link';
import React from 'react';

import type { MockListing } from '@/lib/data/summer-mock-data';
import { listingHref } from '@/lib/listings/use-listings';

interface WebListingCardProps {
  listing: MockListing;
  favorite: boolean;
  onFavorite(id: string, favorite: boolean): void;
}

export function WebListingCard({ listing, favorite, onFavorite }: WebListingCardProps) {
  return (
    <article className="product-card">
      <div className="product-card-img-wrapper">
        <Link aria-label={`${listing.title} 상세 보기`} href={listingHref(listing)}>
          <ListingImage
            alt={listing.title}
            className="product-card-img"
            fill
            sizes="(max-width: 480px) 50vw, 240px"
            src={listing.images[0]}
            unoptimized
          />
        </Link>
        <button
          aria-label={favorite ? '찜 해제' : '찜하기'}
          aria-pressed={favorite}
          className="favorite-btn"
          onClick={() => onFavorite(listing.dataSource === 'go' ? `go:${listing.id}` : listing.id, !favorite)}
          type="button"
        >
          <Heart
            color={favorite ? 'var(--danger)' : 'var(--text-muted)'}
            fill={favorite ? 'var(--danger)' : 'none'}
            size={17}
          />
        </button>
      </div>

      <div className="product-card-info">
        <div className="product-sport-tag">
          {listing.dataSource === 'go' ? 'Go 서버' : listing.dataSource === 'supabase' ? '기존 서버' : '데모'} · {listing.sportLabel} · {listing.conditionLabel}
        </div>
        <h3 className="product-title">
          <Link href={listingHref(listing)}>{listing.title}</Link>
        </h3>
        <div className="product-spec-row">
          <MapPin size={12} />
          <span>{listing.location}</span>
        </div>
        <div className="product-price">{listing.price.toLocaleString()}원</div>
      </div>
    </article>
  );
}

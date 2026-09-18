'use client';

import { Heart, MapPin } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';

import type { MockListing } from '@/lib/data/summer-mock-data';

interface WebListingCardProps {
  listing: MockListing;
  favorite: boolean;
  onFavorite(id: string, favorite: boolean): void;
}

export function WebListingCard({ listing, favorite, onFavorite }: WebListingCardProps) {
  return (
    <article className="product-card">
      <div className="product-card-img-wrapper">
        <Link aria-label={`${listing.title} 상세 보기`} href={`/market/${listing.id}`}>
          <Image
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
          onClick={() => onFavorite(listing.id, !favorite)}
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
          {listing.sportLabel} · {listing.conditionLabel}
        </div>
        <h3 className="product-title">
          <Link href={`/market/${listing.id}`}>{listing.title}</Link>
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

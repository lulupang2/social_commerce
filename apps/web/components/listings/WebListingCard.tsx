'use client';

import { useLocale } from 'next-intl';
import { formatWon } from '@/lib/display-format';
import { useTranslate } from '@/lib/i18n/use-translate';

import { Heart, MapPin } from 'lucide-react';
import Link from 'next/link';

import { ListingImage } from '@/components/media/ListingImage';
import type { MockListing } from '@/lib/data/summer-mock-data';
import { listingHref } from '@/lib/listings/use-listings';

interface WebListingCardProps {
  listing: MockListing;
  favorite: boolean;
  onFavorite(id: string, favorite: boolean): void;
}

export function WebListingCard({ listing, favorite, onFavorite }: WebListingCardProps) {
  const translate = useTranslate();
  const locale = useLocale();
  const favoriteId = listing.dataSource === 'go' ? 'go:' + listing.id : listing.id;
  const isSample = !listing.dataSource;

  return (
    <article className="product-card">
      <div className="product-card-img-wrapper">
        <Link aria-label={listing.title + translate(" 상세 보기")} href={listingHref(listing)}>
          <ListingImage
            alt={listing.title}
            className="product-card-img"
            fill
            sizes="(max-width: 639px) 50vw, (max-width: 1199px) 33vw, 300px"
            src={listing.images[0]}
            unoptimized
          />
        </Link>
        <button
          aria-label={favorite ? translate("찜 해제") : translate("찜하기")}
          aria-pressed={favorite}
          className="favorite-btn"
          onClick={() => onFavorite(favoriteId, !favorite)}
          type="button"
        >
          <Heart
            fill={favorite ? 'currentColor' : 'none'}
            size={18}
          />
        </button>
      </div>

      <div className="product-card-info">
        <div className="product-sport-tag">
          <span>{translate(listing.sportLabel)}</span>
          <span>{translate(listing.conditionLabel)}</span>
          {isSample ? <span>{translate("시연용")}</span> : null}
        </div>
        <h3 className="product-title">
          <Link href={listingHref(listing)}>{listing.title}</Link>
        </h3>
        <div className="product-price">{formatWon(listing.price, locale)}</div>
        <div className="product-spec-row">
          <MapPin aria-hidden="true" size={13} />
          <span>{listing.location}</span>
        </div>
      </div>
    </article>
  );
}

'use client';

import {
  ArrowLeft,
  Heart,
  MapPin,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ListingImage } from '@/components/media/ListingImage';
import type { PortfolioPreviewListing } from '@/lib/data/portfolio-preview-data';

import {
  PreviewHeader,
  type PreviewVariant,
} from './PortfolioPreview';
import styles from './PortfolioPreview.module.css';

type PreviewTheme = 'light' | 'dark';

function formatPrice(price: number) {
  return `${price.toLocaleString('ko-KR')}원`;
}

export function PortfolioProductDetail({
  listing,
  variant,
  initialTheme = 'light',
}: {
  listing: PortfolioPreviewListing;
  variant: PreviewVariant;
  initialTheme?: PreviewTheme;
}) {
  const [theme, setTheme] = useState<PreviewTheme>(initialTheme);
  const [favorite, setFavorite] = useState(false);
  const [notice, setNotice] = useState('');

  return (
    <div
      className={styles.previewRoot}
      data-theme={theme}
      data-variant={variant}
    >
      <PreviewHeader
        setTheme={setTheme}
        theme={theme}
        variant={variant}
      />

      <div className={styles.sampleNotice}>
        포트폴리오 상품 상세 미리보기입니다. 상품 정보는 시안 비교용 샘플입니다.
      </div>

      <main className={styles.detailPage}>
        <Link
          className={styles.detailBack}
          href={`/preview/${variant}${theme === 'dark' ? '?theme=dark' : ''}`}
        >
          <ArrowLeft size={17} />
          시안 {variant.toUpperCase()}로 돌아가기
        </Link>

        <section className={styles.detailLayout}>
          <div className={styles.detailVisualColumn}>
            <div className={styles.detailImage}>
              <ListingImage
                alt={listing.imageAlt}
                fill
                priority
                sizes="(max-width: 767px) 100vw, 700px"
                src={listing.image}
                unoptimized
              />
            </div>
            <p className={styles.detailPhotoNote}>
              포트폴리오 시연 이미지입니다. 실제 등록 상품 사진과 연결되지 않습니다.
            </p>
          </div>

          <div className={styles.detailInfo}>
            <div className={styles.detailMeta}>
              <span>{listing.sport === 'surf' ? '서핑' : '테니스'}</span>
              <span>{listing.category}</span>
              <span>{listing.condition}</span>
            </div>

            <h1>{listing.title}</h1>
            <strong className={styles.detailPrice}>{formatPrice(listing.price)}</strong>

            <p className={styles.detailLocation}>
              <MapPin aria-hidden="true" size={16} />
              {listing.location}
            </p>

            <div className={styles.detailRule} />

            <div className={styles.detailSpecs}>
              {listing.specs.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <div className={styles.detailDescription}>
              <h2>상품 설명</h2>
              <p>{listing.description}</p>
            </div>

            <div className={styles.previewSeller}>
              <ShieldCheck size={18} />
              <div>
                <strong>샘플 판매자 정보</strong>
                <span>실제 판매자 평점이나 거래 실적을 표시하지 않습니다.</span>
              </div>
            </div>

            <div className={styles.detailActions}>
              <button
                aria-label={favorite ? '미리보기 찜 해제' : '미리보기 찜하기'}
                aria-pressed={favorite}
                className={styles.detailFavorite}
                onClick={() => setFavorite((value) => !value)}
                type="button"
              >
                <Heart fill={favorite ? 'currentColor' : 'none'} size={20} />
                {favorite ? '찜 해제' : '찜하기'}
              </button>
              <button
                className={styles.detailContact}
                onClick={() =>
                  setNotice(
                    '시안에서는 거래를 실행하지 않습니다. 실제 거래 흐름은 기존 상품 상세에서 확인할 수 있습니다.',
                  )
                }
                type="button"
              >
                <MessageCircle size={19} />
                문의 흐름 미리보기
              </button>
            </div>

            {listing.liveHref ? (
              <Link className={styles.liveFlowLink} href={listing.liveHref}>
                기존 상품 상세에서 거래 흐름 보기
              </Link>
            ) : (
              <p className={styles.unlinkedNote}>
                이 샘플 상품은 디자인 비교 전용이라 실제 거래 기능과 연결되지 않습니다.
              </p>
            )}

            {notice ? (
              <p className={styles.detailNotice} role="status">
                {notice}
              </p>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

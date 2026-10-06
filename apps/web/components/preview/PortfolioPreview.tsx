'use client';

import { useTranslate } from '@/lib/i18n/use-translate';

import { ArrowUpRight, Heart, MapPin, Moon, Search, Sun, Waves } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ListingImage } from '@/components/media/ListingImage';
import {
  PORTFOLIO_PREVIEW_LISTINGS,
  type PortfolioPreviewListing,
  type PreviewSport,
} from '@/lib/data/portfolio-preview-data';

import styles from './PortfolioPreview.module.css';

export type PreviewVariant = 'a' | 'b';
type PreviewTheme = 'light' | 'dark';
type SportFilter = 'all' | PreviewSport;

const SURF_HERO =
  'https://images.unsplash.com/photo-1646054346984-3268571524ae?auto=format&fit=crop&w=1500&q=86';
const TENNIS_HERO =
  'https://images.unsplash.com/photo-1651319087172-d27177766eab?auto=format&fit=crop&w=1000&q=84';

function formatPrice(price: number) {
  return `${price.toLocaleString('ko-KR')}원`;
}

function previewHref(variant: PreviewVariant, id: string, theme: PreviewTheme) {
  const params = new URLSearchParams({ id });
  if (theme === 'dark') params.set('theme', 'dark');
  return `/preview/${variant}/product?${params.toString()}`;
}

function ProductCard({
  listing,
  variant,
  theme,
}: {
  listing: PortfolioPreviewListing;
  variant: PreviewVariant;
  theme: PreviewTheme;
}) {
  const translate = useTranslate();
  const [favorite, setFavorite] = useState(false);

  return (
    <article className={styles.productCard}>
      <div className={styles.productImage}>
        <Link
          aria-label={translate(`${listing.title} 디자인 상세 보기`)}
          href={previewHref(variant, listing.id, theme)}
        >
          <ListingImage
            alt={listing.imageAlt}
            fill
            sizes="(max-width: 639px) 50vw, (max-width: 1199px) 33vw, 300px"
            src={listing.image}
            unoptimized
          />
        </Link>
        <button
          aria-label={favorite ? translate('미리보기 찜 해제') : translate('미리보기 찜하기')}
          aria-pressed={favorite}
          className={styles.favoriteButton}
          onClick={() => setFavorite((value) => !value)}
          type="button"
        >
          <Heart fill={favorite ? 'currentColor' : 'none'} size={18} />
        </button>
      </div>

      <div className={styles.productInfo}>
        <div className={styles.productMeta}>
          <span>{listing.sport === 'surf' ? translate('서핑') : translate('테니스')}</span>
          <span>{translate(listing.condition)}</span>
        </div>
        <h3>
          <Link href={previewHref(variant, listing.id, theme)}>{listing.title}</Link>
        </h3>
        <strong className={styles.productPrice}>{translate(formatPrice(listing.price))}</strong>
        <p className={styles.productLocation}>
          <MapPin aria-hidden="true" size={13} />
          <span>{listing.location}</span>
        </p>
      </div>
    </article>
  );
}

export function PreviewHeader({
  variant,
  theme,
  setTheme,
}: {
  variant: PreviewVariant;
  theme: PreviewTheme;
  setTheme: (theme: PreviewTheme) => void;
}) {
  const translate = useTranslate();
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href={`/preview/${variant}`}>
          <Waves aria-hidden="true" size={25} strokeWidth={1.8} />
          <span>SummerGear</span>
        </Link>

        <nav aria-label={translate('주요 탐색')} className={styles.desktopNav}>
          <Link href="/market">{translate('마켓')}</Link>
          <Link href="/community">{translate('커뮤니티')}</Link>
          <Link href="/sell">{translate('판매하기')}</Link>
        </nav>

        <div className={styles.previewControls}>
          <div aria-label={translate('디자인 시안 선택')} className={styles.variantSwitch}>
            <Link
              aria-current={variant === 'a' ? 'page' : undefined}
              className={variant === 'a' ? styles.switchActive : undefined}
              href={`/preview/a${theme === 'dark' ? '?theme=dark' : ''}`}
            >
              A
            </Link>
            <Link
              aria-current={variant === 'b' ? 'page' : undefined}
              className={variant === 'b' ? styles.switchActive : undefined}
              href={`/preview/b${theme === 'dark' ? '?theme=dark' : ''}`}
            >
              B
            </Link>
          </div>
          <button
            aria-label={
              theme === 'dark' ? translate('라이트 테마로 보기') : translate('다크 테마로 보기')
            }
            className={styles.themeButton}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            type="button"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}

function FilterButtons({
  active,
  setActive,
}: {
  active: SportFilter;
  setActive: (sport: SportFilter) => void;
}) {
  const translate = useTranslate();
  const options: Array<{ value: SportFilter; label: string }> = [
    { value: 'all', label: translate('전체 장비') },
    { value: 'surf', label: translate('서핑') },
    { value: 'tennis', label: translate('테니스') },
  ];

  return (
    <div aria-label={translate('종목 필터')} className={styles.filterButtons} role="group">
      {options.map((option) => (
        <button
          aria-pressed={active === option.value}
          className={active === option.value ? styles.filterActive : undefined}
          key={option.value}
          onClick={() => setActive(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function PortfolioPreview({
  variant,
  initialTheme = 'light',
}: {
  variant: PreviewVariant;
  initialTheme?: PreviewTheme;
}) {
  const translate = useTranslate();
  const [theme, setTheme] = useState<PreviewTheme>(initialTheme);
  const [sport, setSport] = useState<SportFilter>('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko-KR');
    return PORTFOLIO_PREVIEW_LISTINGS.filter((item) => {
      const matchesSport = sport === 'all' || item.sport === sport;
      const matchesQuery =
        normalized.length === 0 ||
        [item.title, item.category, item.location]
          .join(' ')
          .toLocaleLowerCase('ko-KR')
          .includes(normalized);
      return matchesSport && matchesQuery;
    });
  }, [query, sport]);

  const grid = (
    <section className={styles.gearSection} id="gear">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionKicker}>Curated gear</p>
          <h2>
            {variant === 'a'
              ? translate('이번 주에 둘러볼 장비')
              : translate('샘플 장비 전체 보기')}
          </h2>
        </div>
        <span>{translate(`${visible.length}개 샘플`)}</span>
      </div>

      {visible.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>{translate('조건에 맞는 샘플 장비가 없습니다.')}</strong>
          <p>{translate('검색어를 지우거나 다른 종목을 선택해 보세요.')}</p>
        </div>
      ) : (
        <div className={styles.productGrid}>
          {visible.map((listing) => (
            <ProductCard key={listing.id} listing={listing} theme={theme} variant={variant} />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className={styles.previewRoot} data-theme={theme} data-variant={variant}>
      <PreviewHeader setTheme={setTheme} theme={theme} variant={variant} />

      <div className={styles.sampleNotice}>
        {translate(
          '포트폴리오 디자인 미리보기입니다. 아래 상품과 가격은 화면 비교를 위한 샘플 데이터입니다.',
        )}
      </div>

      <main className={styles.page}>
        {variant === 'a' ? (
          <>
            <section className={styles.heroA}>
              <div className={styles.heroCopy}>
                <p className={styles.heroKicker}>Surf and tennis edit</p>
                <h1>
                  {translate('파도와 코트 사이,')}
                  <br />
                  {translate('다음 장비를 고르는 시간')}
                </h1>
                <p className={styles.heroDescription}>
                  {translate(
                    '서핑과 테니스를 즐기는 사람을 위한 중고 스포츠 라이프스타일 셀렉션. 상태와 지역을 비교해 다음 장비를 골라보세요.',
                  )}
                </p>
                <div className={styles.heroActions}>
                  <a className={styles.primaryAction} href="#gear">
                    {translate('장비 둘러보기')}
                    <ArrowUpRight size={17} />
                  </a>
                  <Link className={styles.secondaryAction} href="/market">
                    {translate('현재 마켓 보기')}
                  </Link>
                </div>
              </div>

              <div className={styles.heroGallery}>
                <div className={styles.heroMainImage}>
                  <ListingImage
                    alt={translate('양양 해변에서 서핑을 준비하는 분위기의 사진')}
                    fill
                    priority
                    sizes="(max-width: 767px) 100vw, 720px"
                    src={SURF_HERO}
                    unoptimized
                  />
                </div>
                <div className={styles.heroSecondaryImage}>
                  <ListingImage
                    alt={translate('테니스 라켓이 놓인 라이프스타일 사진')}
                    fill
                    sizes="(max-width: 767px) 42vw, 260px"
                    src={TENNIS_HERO}
                    unoptimized
                  />
                </div>
              </div>
            </section>

            <section className={styles.categorySplit}>
              <button
                aria-pressed={sport === 'surf'}
                className={sport === 'surf' ? styles.categoryActive : undefined}
                onClick={() => setSport(sport === 'surf' ? 'all' : 'surf')}
                type="button"
              >
                <span>Surf</span>
                <strong>{translate('바다에서 필요한 장비')}</strong>
                <small>{translate('보드, 핀, 리시와 이동 장비')}</small>
              </button>
              <button
                aria-pressed={sport === 'tennis'}
                className={sport === 'tennis' ? styles.categoryActive : undefined}
                onClick={() => setSport(sport === 'tennis' ? 'all' : 'tennis')}
                type="button"
              >
                <span>Tennis</span>
                <strong>{translate('코트에서 필요한 장비')}</strong>
                <small>{translate('라켓, 볼, 그립과 수납 장비')}</small>
              </button>
            </section>

            {grid}
          </>
        ) : (
          <>
            <section className={styles.marketIntro}>
              <div>
                <p className={styles.heroKicker}>SummerGear Market</p>
                <h1>{translate('필요한 장비부터 바로 찾으세요.')}</h1>
              </div>
              <p>
                {translate(
                  '서핑과 테니스를 한 화면에서 비교하고, 상태와 지역을 확인하는 탐색 중심 시안입니다.',
                )}
              </p>
            </section>

            <section className={styles.marketSearchPanel}>
              <label className={styles.marketSearch}>
                <Search aria-hidden="true" size={20} />
                <span className={styles.visuallyHidden}>{translate('샘플 장비 검색')}</span>
                <input
                  autoComplete="off"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={translate('장비명, 카테고리, 지역 검색')}
                  type="search"
                  value={query}
                />
              </label>
              <FilterButtons active={sport} setActive={setSport} />
            </section>

            <section className={styles.marketFeature}>
              <div className={styles.marketFeatureImage}>
                <ListingImage
                  alt={translate('해변의 서프보드')}
                  fill
                  priority
                  sizes="(max-width: 767px) 46vw, 360px"
                  src={SURF_HERO}
                  unoptimized
                />
              </div>
              <div className={styles.marketFeatureImage}>
                <ListingImage
                  alt={translate('테니스 라켓 두 자루')}
                  fill
                  priority
                  sizes="(max-width: 767px) 46vw, 360px"
                  src={TENNIS_HERO}
                  unoptimized
                />
              </div>
              <div className={styles.marketFeatureCopy}>
                <span>{translate('이번 주 스포츠 셀렉션')}</span>
                <strong>
                  {translate('바다와 코트에서 바로 쓰기 좋은 장비를 한곳에 모았습니다.')}
                </strong>
                <a href="#gear">{translate('상품부터 보기')}</a>
              </div>
            </section>

            {grid}
          </>
        )}
      </main>

      <footer className={styles.previewFooter}>
        <div>
          <Waves aria-hidden="true" size={20} />
          <strong>SummerGear</strong>
        </div>
        <p>{translate('디자인 시안 전용 경로입니다. 실제 운영 화면은 변경하지 않았습니다.')}</p>
      </footer>
    </div>
  );
}

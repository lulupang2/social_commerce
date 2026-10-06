'use client';

import { useLocale } from 'next-intl';
import { formatWon } from '@/lib/display-format';
import { useTranslate } from '@/lib/i18n/use-translate';

import { ArrowUpRight, ChevronRight, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import { WebListingCard } from '@/components/listings/WebListingCard';
import { ListingImage } from '@/components/media/ListingImage';
import { AUTH_SESSION_EVENT } from '@/lib/go-auth/client';
import { toMarketListing } from '@/lib/go-listings/client';
import {
  getRecommendations,
  type RecommendationResult,
} from '@/lib/go-listings/recommendations';
import { useFavorites } from '@/lib/listings/use-favorites';
import { listingHref, toMockListing, useListings } from '@/lib/listings/use-listings';

import styles from './HomeStorefront.module.css';

const SURF_HERO =
  'https://images.unsplash.com/photo-1646054346984-3268571524ae?auto=format&fit=crop&w=1500&q=86';
const TENNIS_HERO =
  'https://images.unsplash.com/photo-1651319087172-d27177766eab?auto=format&fit=crop&w=1000&q=84';

export default function HomePage() {
  const translate = useTranslate();
  const locale = useLocale();
  const {
    listings: allListings,
    source,
    setMode,
    isLoading,
    error,
    retry,
  } = useListings();
  const [selectedSport, setSelectedSport] = useState<'all' | 'surf' | 'tennis'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { favorites, updateFavorite, error: favoriteError } = useFavorites();
  const [recommendations, setRecommendations] = useState<RecommendationResult>([]);
  const [recommendationError, setRecommendationError] = useState('');
  const [recommendationLoading, setRecommendationLoading] = useState(true);
  const [recommendationRevision, setRecommendationRevision] = useState(0);

  useEffect(() => {
    if (source !== 'server') return;
    let active = true;
    void getRecommendations().then((result) => {
      if (!active) return;
      if (result.ok) {
        setRecommendations(result.items);
        setRecommendationError('');
      } else {
        setRecommendations([]);
        setRecommendationError(result.message);
      }
      setRecommendationLoading(false);
    });
    return () => {
      active = false;
    };
  }, [source, recommendationRevision]);

  const recommendedListings = useMemo(
    () =>
      recommendations.flatMap((entry) => {
        const market = toMarketListing(entry.listing);
        const item = market ? toMockListing(market, 'go') : null;
        return item ? [{ item, reason: entry.reason }] : [];
      }),
    [recommendations],
  );

  const isPersonalized = recommendations.some((item) => item.score > 0);

  useEffect(() => {
    const refresh = () => {
      setRecommendations([]);
      setRecommendationLoading(true);
      setRecommendationRevision((revision) => revision + 1);
    };
    window.addEventListener(AUTH_SESSION_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const filteredListings = allListings.filter((item) => {
    const matchesSport = selectedSport === 'all' || item.sport === selectedSport;
    const normalized = searchQuery.trim().toLocaleLowerCase('ko-KR');
    const matchesSearch =
      normalized.length === 0 ||
      [item.title, item.location, item.sportLabel]
        .join(' ')
        .toLocaleLowerCase('ko-KR')
        .includes(normalized);
    return matchesSport && matchesSearch;
  });

  const selectSport = (sport: 'surf' | 'tennis') => {
    setSelectedSport((current) => (current === sport ? 'all' : sport));
  };

  return (
    <MobileShell storefront>
      <div className={styles.home}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Surf and tennis edit</p>
            <h1>
              {translate("파도와 코트 사이,")}<br />
              {translate("다음 장비를 고르는 시간")}</h1>
            <p className={styles.heroDescription}>
              {translate("서핑과 테니스를 즐기는 사람을 위한 스포츠 라이프스타일 마켓입니다. 상태와 지역을 비교하고 나에게 맞는 다음 장비를 찾아보세요.")}</p>
            <div className={styles.heroActions}>
              <a className={styles.primaryAction} href="#gear">
                {translate("장비 둘러보기")}<ArrowUpRight aria-hidden="true" size={17} />
              </a>
              <Link className={styles.secondaryAction} href="/market">
                {translate("마켓 전체 보기")}</Link>
            </div>
          </div>

          <div className={styles.heroGallery}>
            <div className={styles.heroMain}>
              <ListingImage
                alt={translate("해변에서 서핑을 즐기는 라이프스타일 이미지")}
                fill
                priority
                sizes="(max-width: 899px) 100vw, 700px"
                src={SURF_HERO}
                unoptimized
              />
            </div>
            <div className={styles.heroSecondary}>
              <ListingImage
                alt={translate("테니스 라켓이 놓인 라이프스타일 이미지")}
                fill
                sizes="(max-width: 899px) 38vw, 260px"
                src={TENNIS_HERO}
                unoptimized
              />
            </div>
          </div>
        </section>

        <section aria-label={translate("스포츠별 장비 보기")} className={styles.categorySplit}>
          <button
            aria-pressed={selectedSport === 'surf'}
            onClick={() => selectSport('surf')}
            type="button"
          >
            <span>Surf</span>
            <strong>{translate("바다에서 필요한 장비")}</strong>
            <small>{translate("보드와 액세서리, 이동 장비를 둘러보세요.")}</small>
          </button>
          <button
            aria-pressed={selectedSport === 'tennis'}
            onClick={() => selectSport('tennis')}
            type="button"
          >
            <span>Tennis</span>
            <strong>{translate("코트에서 필요한 장비")}</strong>
            <small>{translate("라켓과 가방, 코트 장비를 둘러보세요.")}</small>
          </button>
        </section>

        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search aria-hidden="true" size={19} />
            <span className="visually-hidden">{translate("장비 검색")}</span>
            <input
              autoComplete="off"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={translate("장비명, 종목, 거래 지역 검색")}
              type="search"
              value={searchQuery}
            />
          </label>
          {selectedSport !== 'all' ? (
            <button
              className="btn-outline"
              onClick={() => setSelectedSport('all')}
              type="button"
            >
              {translate("전체 장비 보기")}</button>
          ) : null}
        </div>

        <div className={styles.sourcePanel}>
          <div>
            <strong>{source === 'demo' ? translate("시연용 상품을 보고 있어요.") : translate("실제 등록 상품을 보고 있어요.")}</strong>
            <br />
            {source === 'demo'
              ? translate("화면 체험을 위한 샘플이며 실제 구매 가능한 재고가 아닙니다.")
              : translate("서버에서 불러온 상품만 표시하며 연결 오류를 샘플 상품으로 대체하지 않습니다.")}
          </div>
          <button
            onClick={() => {
              setRecommendations([]);
              setRecommendationLoading(true);
              setMode(source === 'demo' ? 'server' : 'demo');
            }}
            type="button"
          >
            {source === 'demo' ? translate("실제 등록 상품 보기") : translate("시연 화면 보기")}
          </button>
        </div>

        {source === 'server' && isLoading ? (
          <div className={styles.feedback} role="status">
            {translate("등록된 장비를 불러오고 있어요.")}</div>
        ) : null}

        {source === 'server' && !isLoading && error ? (
          <div className={styles.feedback} role="alert">
            {translate(error)}
            <button className="btn-outline" onClick={retry} type="button">
              {translate("다시 시도")}</button>
          </div>
        ) : null}

        {favoriteError ? (
          <div className={styles.feedback} role="alert">
            {translate(favoriteError)}
          </div>
        ) : null}

        {source === 'server' && searchQuery === '' && selectedSport === 'all' ? (
          <section className={styles.recommendations}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.kicker}>Selected gear</p>
                <h2>{isPersonalized ? translate("나를 위한 장비 추천") : translate("지금 둘러볼 장비")}</h2>
              </div>
              <Link href="/market">
                {translate("더보기")}<ChevronRight aria-hidden="true" size={15} />
              </Link>
            </div>

            {recommendationLoading ? (
              <div className={styles.feedback} role="status">
                {translate("구매 가능한 장비를 찾고 있어요.")}</div>
            ) : null}

            {recommendationError ? (
              <div className={styles.feedback} role="alert">
                {translate(recommendationError)}
                <button
                  className="btn-outline"
                  onClick={() => {
                    setRecommendationLoading(true);
                    setRecommendationRevision((revision) => revision + 1);
                  }}
                  type="button"
                >
                  {translate("다시 시도")}</button>
              </div>
            ) : null}

            {!recommendationLoading &&
            !recommendationError &&
            recommendedListings.length === 0 ? (
              <div className={styles.empty}>{translate("현재 추천할 수 있는 장비가 없어요.")}</div>
            ) : null}

            {!recommendationError && recommendedListings.length > 0 ? (
              <div className={styles.recommendationRail}>
                {recommendedListings.map(({ item, reason }) => (
                  <Link
                    className={styles.recommendationCard}
                    href={listingHref(item)}
                    key={(item.dataSource ?? 'demo') + ':' + item.id}
                  >
                    <div className={styles.recommendationImage}>
                      <ListingImage
                        alt={item.title}
                        fill
                        sizes="(max-width: 639px) 72vw, 280px"
                        src={item.images[0]}
                        unoptimized
                      />
                    </div>
                    {reason ? <span className={styles.reason}>{translate(reason)}</span> : null}
                    <h3>{item.title}</h3>
                    <strong>{formatWon(item.price, locale)}</strong>
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className={styles.gear} id="gear">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>Curated gear</p>
              <h2>
                {selectedSport === 'all'
                  ? translate("새로 올라온 장비")
                  : selectedSport === 'surf'
                    ? translate("서핑 장비")
                    : translate("테니스 장비")}
              </h2>
            </div>
            <span>{isLoading ? translate("불러오는 중") : filteredListings.length + translate("개")}</span>
          </div>

          {!isLoading && filteredListings.length === 0 ? (
            <div className={styles.empty}>
              {translate("조건에 맞는 장비가 없습니다. 검색어를 지우거나 다른 종목을 선택해 보세요.")}</div>
          ) : (
            <div className="product-grid">
              {filteredListings.map((item) => (
                <WebListingCard
                  favorite={
                    favorites[item.dataSource === 'go' ? 'go:' + item.id : item.id] ?? false
                  }
                  key={(item.dataSource ?? 'demo') + ':' + item.id}
                  listing={item}
                  onFavorite={updateFavorite}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </MobileShell>
  );
}

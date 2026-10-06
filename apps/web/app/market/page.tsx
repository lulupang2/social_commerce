'use client';

import { useTranslate } from '@/lib/i18n/use-translate';

import { CalendarDays, Search, ShoppingBag, Waves } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { WebListingCard } from '@/components/listings/WebListingCard';
import { MobileShell } from '@/components/layout/MobileShell';
import { CourtTransfers } from '@/components/vertical/CourtTransfers';
import { WaveBriefing } from '@/components/vertical/WaveBriefing';
import { emptyCatalogFilters, useCatalog, type CatalogFilters } from '@/lib/go-listings/use-catalog';
import { toMockListing } from '@/lib/listings/use-listings';
import { useFavorites } from '@/lib/listings/use-favorites';

type MarketMode = 'gear' | 'waves' | 'courts';

const filterKeys = ['sport', 'category', 'search', 'location', 'minPrice', 'maxPrice', 'sort'] as const;
function readFilters(): CatalogFilters {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(filterKeys.map((key) => [key, params.get(key) ?? emptyCatalogFilters[key]])) as CatalogFilters;
}

export default function MarketPage() {
  const translate = useTranslate();
  const { favorites, updateFavorite, error: favoriteError } = useFavorites();
  const [mode, setMode] = useState<MarketMode>('gear');
  const [filters, setFilters] = useState<CatalogFilters>(emptyCatalogFilters);
  const [committed, setCommitted] = useState<CatalogFilters>(emptyCatalogFilters);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const restore = () => { const next = readFilters(); setFilters(next); setCommitted(next); setReady(true); };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setCommitted(filters), 250);
    return () => clearTimeout(timer);
  }, [filters, ready]);
  const filtersPending = JSON.stringify(filters) !== JSON.stringify(committed);
  const catalog = useCatalog(committed, ready && !filtersPending);
  const isLoading = !ready || filtersPending || catalog.loading;
  const error = catalog.error;
  const retry = catalog.retry;
  const allListings = filtersPending ? [] : catalog.items.flatMap((item) => { const mapped = toMockListing(item, 'go'); return mapped ? [mapped] : []; });
  const updateFilters = (changes: Partial<CatalogFilters>, replace = false) => {
    const next = { ...filters, ...changes };
    const params = new URLSearchParams();
    for (const key of filterKeys) if (next[key] && !(key === 'sort' && next[key] === 'recent')) params.set(key, next[key]);
    const query = params.toString();
    window.history[replace ? 'replaceState' : 'pushState'](null, '', `/market${query ? `?${query}` : ''}`);
    setFilters(next);
  };
  const resetFilters = () => updateFilters(emptyCatalogFilters);

  return (
    <MobileShell storefront title={translate("마켓")}>
      <div className="vertical-mode-tabs" role="tablist" aria-label={translate("마켓 보기")}>
        <button
          aria-selected={mode === 'gear'}
          className={mode === 'gear' ? 'active' : ''}
          onClick={() => setMode('gear')}
          role="tab"
          type="button"
        >
          <ShoppingBag size={17} />
          <span>{translate("장비")}</span>
        </button>
        <button
          aria-selected={mode === 'waves'}
          className={mode === 'waves' ? 'active' : ''}
          onClick={() => setMode('waves')}
          role="tab"
          type="button"
        >
          <Waves size={17} />
          <span>{translate("파도")}</span>
        </button>
        <button
          aria-selected={mode === 'courts'}
          className={mode === 'courts' ? 'active' : ''}
          onClick={() => setMode('courts')}
          role="tab"
          type="button"
        >
          <CalendarDays size={17} />
          <span>{translate("코트 양도")}</span>
        </button>
      </div>

      {mode === 'waves' ? <WaveBriefing /> : null}
      {mode === 'courts' ? <CourtTransfers /> : null}

      {mode === 'gear' ? (
        <>
          <div className="search-container">
            <div className="search-input-wrapper">
              <Search className="search-icon" size={18} />
              <label className="visually-hidden" htmlFor="market-search">
                {translate("장비 검색")}</label>
              <input
                className="search-input"
                id="market-search"
                onChange={(event) => updateFilters({ search: event.target.value }, true)}
                placeholder={translate("상품명·설명·거래 지역 검색")}
                type="search"
                value={filters.search}
              />
            </div>
          </div>

          <div className="sport-tabs" role="group" aria-label={translate("스포츠 필터")}>
            <button
              aria-pressed={filters.sport === ''}
              className={`sport-tab ${filters.sport === '' ? 'active' : ''}`}
              onClick={() => updateFilters({ sport: '' })}
              type="button"
            >
              {translate("전체")}</button>
            <button
              aria-pressed={filters.sport === 'surf'}
              className={`sport-tab ${filters.sport === 'surf' ? 'active' : ''}`}
              onClick={() => updateFilters({ sport: 'surf' })}
              type="button"
            >
              {translate("서핑")}</button>
            <button
              aria-pressed={filters.sport === 'tennis'}
              className={`sport-tab ${filters.sport === 'tennis' ? 'active' : ''}`}
              onClick={() => updateFilters({ sport: 'tennis' })}
              type="button"
            >
              {translate("테니스")}</button>
          </div>

          <div className="market-filter-bar">
            <p>
              {translate("현재 불러온 장비 ·")}{' '}
              {isLoading ? translate("불러오는 중") : error && allListings.length === 0 ? translate("조회 실패") : <><strong>{allListings.length}</strong>{translate("개")}</>}
            </p>
            <label className="visually-hidden" htmlFor="category-filter">
              {translate("카테고리")}</label>
            <select
              id="category-filter"
              onChange={(event) => updateFilters({ category: event.target.value })}
              value={filters.category}
            >
              <option value="">{translate("전체 카테고리")}</option>
              <option value="equipment">{translate("보드 / 라켓 / 장비")}</option>
              <option value="apparel">{translate("의류 / 웻슈트")}</option>
              <option value="footwear">{translate("신발")}</option>
              <option value="accessories">{translate("액세서리")}</option>
              <option value="protective">{translate("보호 장비")}</option>
              <option value="other">{translate("기타")}</option>
            </select>
          </div>
          <div className="market-filter-bar market-filter-fields">
            <label>{translate("지역")}<input className="form-input" aria-label={translate("지역")} placeholder={translate("예: 양양군")} value={filters.location} maxLength={160} onChange={(event) => updateFilters({ location: event.target.value }, true)} /></label>
            <label>{translate("최저 가격")}<input className="form-input" aria-label={translate("최저 가격")} placeholder={translate("최저 금액 (원)")} inputMode="numeric" value={filters.minPrice} onChange={(event) => updateFilters({ minPrice: event.target.value }, true)} /></label>
            <label>{translate("최고 가격")}<input className="form-input" aria-label={translate("최고 가격")} placeholder={translate("최고 금액 (원)")} inputMode="numeric" value={filters.maxPrice} onChange={(event) => updateFilters({ maxPrice: event.target.value }, true)} /></label>
            <label>{translate("정렬")}<select className="form-select" aria-label={translate("정렬")} value={filters.sort} onChange={(event) => updateFilters({ sort: event.target.value })}>
              <option value="recent">{translate("최신순")}</option><option value="price_asc">{translate("낮은 가격순")}</option><option value="price_desc">{translate("높은 가격순")}</option>
            </select></label>
          </div>
          {favoriteError ? <p className="form-error" role="alert">{translate(favoriteError)}</p> : null}

          {isLoading && allListings.length === 0 ? (
            <div className="empty-state compact" role="status">{translate("매물을 불러오고 있어요.")}</div>
          ) : (
            <>
              {error ? (
                <div className="empty-state compact" role="alert">
                  <p>{translate(error)}</p>
                  <button className="btn-outline" onClick={retry} type="button">{translate("다시 시도")}</button>
                </div>
              ) : null}
              {allListings.length === 0 && !error && !isLoading ? (
                <div className="empty-state compact">
                  <p>{allListings.length === 0 ? translate("현재 공개된 장비가 없어요.") : translate("조건에 맞는 장비가 없어요. 검색어나 필터를 바꿔 보세요.")}</p>
                  {allListings.length > 0 ? <button className="btn-outline" onClick={resetFilters} type="button">{translate("필터 초기화")}</button> : null}
                </div>
              ) : (
                <div className="product-grid">
                  {allListings.map((listing) => (
                    <WebListingCard
                      favorite={favorites[listing.dataSource === 'go' ? `go:${listing.id}` : listing.id] ?? false}
                      key={`${listing.dataSource ?? 'demo'}:${listing.id}`}
                      listing={listing}
                      onFavorite={updateFavorite}
                    />
                  ))}
                </div>
              )}
              {catalog.nextCursor ? <button className="btn-outline" type="button" disabled={isLoading} onClick={() => void catalog.loadMore()}>{isLoading ? translate("다음 상품 불러오는 중") : translate("상품 더 보기")}</button> : null}
            </>
          )}
        </>
      ) : null}
    </MobileShell>
  );
}

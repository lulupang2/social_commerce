'use client';

import { CalendarDays, Search, ShoppingBag, Waves } from 'lucide-react';
import React, { useState } from 'react';

import { WebListingCard } from '@/components/listings/WebListingCard';
import { MobileShell } from '@/components/layout/MobileShell';
import { CourtTransfers } from '@/components/vertical/CourtTransfers';
import { WaveBriefing } from '@/components/vertical/WaveBriefing';
import { useFavorites } from '@/lib/listings/use-favorites';
import { useListings } from '@/lib/listings/use-listings';

type MarketMode = 'gear' | 'waves' | 'courts';
type SportFilter = 'all' | 'surf' | 'tennis';
type CategoryFilter = 'all' | 'equipment' | 'apparel' | 'footwear' | 'accessories';

export default function MarketPage() {
  const { listings: allListings, source } = useListings();
  const { favorites, updateFavorite } = useFavorites();
  const [mode, setMode] = useState<MarketMode>('gear');
  const [selectedSport, setSelectedSport] = useState<SportFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredListings = allListings.filter((item) => {
    const matchesSport = selectedSport === 'all' || item.sport === selectedSport;
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      normalizedQuery.length === 0 ||
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.location.toLowerCase().includes(normalizedQuery) ||
      Object.values(item.specs).some((value) => value.toLowerCase().includes(normalizedQuery));
    return matchesSport && matchesCategory && matchesSearch;
  });

  const resetFilters = () => {
    setSelectedSport('all');
    setSelectedCategory('all');
    setSearchQuery('');
  };

  return (
    <MobileShell title="썸머 마켓">
      <div className="vertical-mode-tabs" role="tablist" aria-label="마켓 보기">
        <button
          aria-selected={mode === 'gear'}
          className={mode === 'gear' ? 'active' : ''}
          onClick={() => setMode('gear')}
          role="tab"
          type="button"
        >
          <ShoppingBag size={17} />
          <span>장비</span>
        </button>
        <button
          aria-selected={mode === 'waves'}
          className={mode === 'waves' ? 'active' : ''}
          onClick={() => setMode('waves')}
          role="tab"
          type="button"
        >
          <Waves size={17} />
          <span>파도</span>
        </button>
        <button
          aria-selected={mode === 'courts'}
          className={mode === 'courts' ? 'active' : ''}
          onClick={() => setMode('courts')}
          role="tab"
          type="button"
        >
          <CalendarDays size={17} />
          <span>코트 양도</span>
        </button>
      </div>

      {mode === 'waves' ? <WaveBriefing /> : null}
      {mode === 'courts' ? <CourtTransfers /> : null}

      {mode === 'gear' ? (
        <>
          {source === 'demo' ? (
            <div className="demo-mode-banner">
              <span>DEMO</span> Supabase 연결 전에도 전체 흐름을 체험할 수 있어요.
            </div>
          ) : null}

          <div className="search-container">
            <div className="search-input-wrapper">
              <Search className="search-icon" size={18} />
              <label className="visually-hidden" htmlFor="market-search">
                장비 검색
              </label>
              <input
                className="search-input"
                id="market-search"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="보드, 라켓, 스펙, 거래 지역 검색"
                type="search"
                value={searchQuery}
              />
            </div>
          </div>

          <div className="sport-tabs" role="group" aria-label="스포츠 필터">
            <button
              aria-pressed={selectedSport === 'all'}
              className={`sport-tab ${selectedSport === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedSport('all')}
              type="button"
            >
              전체
            </button>
            <button
              aria-pressed={selectedSport === 'surf'}
              className={`sport-tab ${selectedSport === 'surf' ? 'active' : ''}`}
              onClick={() => setSelectedSport('surf')}
              type="button"
            >
              🏄‍♂️ 서핑
            </button>
            <button
              aria-pressed={selectedSport === 'tennis'}
              className={`sport-tab ${selectedSport === 'tennis' ? 'active' : ''}`}
              onClick={() => setSelectedSport('tennis')}
              type="button"
            >
              🎾 테니스
            </button>
          </div>

          <div className="market-filter-bar">
            <p>
              총 <strong>{filteredListings.length}</strong>개의 장비
            </p>
            <label className="visually-hidden" htmlFor="category-filter">
              카테고리
            </label>
            <select
              id="category-filter"
              onChange={(event) => setSelectedCategory(event.target.value as CategoryFilter)}
              value={selectedCategory}
            >
              <option value="all">전체 카테고리</option>
              <option value="equipment">보드 / 라켓 / 장비</option>
              <option value="apparel">의류 / 웻슈트</option>
              <option value="footwear">신발</option>
              <option value="accessories">액세서리</option>
            </select>
          </div>

          {filteredListings.length === 0 ? (
            <div className="empty-state compact">
              <p>조건에 맞는 장비가 없어요. 검색어나 필터를 바꿔 보세요.</p>
              <button className="btn-outline" onClick={resetFilters} type="button">
                필터 초기화
              </button>
            </div>
          ) : (
            <div className="product-grid">
              {filteredListings.map((listing) => (
                <WebListingCard
                  favorite={favorites[listing.id] ?? false}
                  key={listing.id}
                  listing={listing}
                  onFavorite={updateFavorite}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </MobileShell>
  );
}

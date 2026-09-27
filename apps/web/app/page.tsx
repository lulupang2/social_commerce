'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ListingImage } from '@/components/media/ListingImage';
import { WebListingCard } from '@/components/listings/WebListingCard';
import { MobileShell } from '@/components/layout/MobileShell';
import { getRecommendations, type RecommendationResult } from '@/lib/go-listings/recommendations';
import { AUTH_SESSION_EVENT } from '@/lib/go-auth/client';
import { toMarketListing } from '@/lib/go-listings/client';
import { useFavorites } from '@/lib/listings/use-favorites';
import { listingHref, toMockListing, useListings } from '@/lib/listings/use-listings';
import { Search, Sparkles, ChevronRight, Waves, Flame } from 'lucide-react';

export default function HomePage() {
  const { listings: allListings, source, setMode, isLoading, error, retry } = useListings();
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
      if (result.ok) { setRecommendations(result.items); setRecommendationError(''); }
      else { setRecommendations([]); setRecommendationError(result.message); }
      setRecommendationLoading(false);
    });
    return () => { active = false; };
  }, [source, recommendationRevision]);
  const recommendedListings = useMemo(() => recommendations.flatMap((entry) => {
    const market = toMarketListing(entry.listing);
    const item = market ? toMockListing(market, 'go') : null;
    return item ? [{ item, reason: entry.reason }] : [];
  }), [recommendations]);
  const isPersonalized = recommendations.some((item) => item.score > 0);
  useEffect(() => {
    const refresh = () => { setRecommendations([]); setRecommendationLoading(true); setRecommendationRevision((n) => n + 1); };
    window.addEventListener(AUTH_SESSION_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener(AUTH_SESSION_EVENT, refresh); window.removeEventListener('focus', refresh); };
  }, []);

  const filteredListings = allListings.filter((item) => {
    const matchesSport = selectedSport === 'all' || item.sport === selectedSport;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sportLabel.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSport && matchesSearch;
  });

  return (
    <MobileShell>
      {/* Editorial Hero Header */}
      <section className="editorial-hero">
        <div className="hero-badge">
          <Waves size={14} />
          <span>Summer 2026 Season</span>
        </div>
        <h1 className="hero-title">
          뜨거운 여름,
          <br />
          최고의 장비와 함께
        </h1>
        <p className="hero-subtitle">
          서핑보드부터 테니스 라켓까지, 검증된 중고 장비를 만나보세요.
        </p>
      </section>
      <div className="demo-mode-banner">
        <span>{source === 'demo' ? 'DEMO' : 'SERVER'}</span>{' '}
        {source === 'demo' ? '체험용 장비 · 서버 재고가 아닙니다.' : '현재 불러온 서버 매물만 표시합니다.'}
        <button className="btn-outline" type="button" onClick={() => { setRecommendations([]); setRecommendationLoading(true); setMode(source === 'demo' ? 'server' : 'demo'); }}>
          {source === 'demo' ? '서버 매물 보기' : '데모 체험하기'}
        </button>
      </div>
      {source === 'server' && isLoading ? <p role="status">매물을 불러오고 있어요.</p> : null}
      {source === 'server' && !isLoading && error ? (
        <div role="alert"><p>{error}</p><button className="btn-outline" type="button" onClick={retry}>다시 시도</button></div>
      ) : null}
      {favoriteError ? <p className="form-error" role="alert">{favoriteError}</p> : null}

      {/* Search Bar */}
      <div className="search-container">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="장비명, 브랜드, 스펙, 거래 지역 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Sport Category Tabs */}
      <div className="sport-tabs">
        <button
          className={`sport-tab ${selectedSport === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedSport('all')}
        >
          <Flame size={16} />
          <span>전체 스포츠</span>
        </button>
        <button
          className={`sport-tab ${selectedSport === 'surf' ? 'active' : ''}`}
          onClick={() => setSelectedSport('surf')}
        >
          <span>🏄‍♂️ 서핑 (Surf)</span>
        </button>
        <button
          className={`sport-tab ${selectedSport === 'tennis' ? 'active' : ''}`}
          onClick={() => setSelectedSport('tennis')}
        >
          <span>🎾 테니스 (Tennis)</span>
        </button>
      </div>

      {/* Recommendation Rail */}
      {source === 'server' && searchQuery === '' && selectedSport === 'all' && (
        <section style={{ marginBottom: 12 }}>
          <div className="section-header">
            <h2 className="section-title">
              <Sparkles size={18} color="var(--accent)" />
              <span>{isPersonalized ? '맞춤 장비 추천' : '최근 구매 가능 장비'}</span>
            </h2>
            <Link
              href="/market"
              style={{
                fontSize: '0.82rem',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              더보기 <ChevronRight size={14} />
            </Link>
          </div>

          {recommendationLoading ? <p role="status">구매 가능한 장비를 찾고 있어요.</p> : null}
          {recommendationError ? <div role="alert"><p>{recommendationError}</p><button className="btn-outline" type="button" onClick={() => { setRecommendationLoading(true); setRecommendationRevision((n) => n + 1); }}>다시 시도</button></div> : null}
          {!recommendationLoading && !recommendationError && recommendedListings.length === 0 ? <p>현재 구매 가능한 장비가 없어요.</p> : null}
          <div className="recommendation-rail">
            {!recommendationError && recommendedListings.map(({ item, reason }) => (
              <Link href={listingHref(item)} key={`${item.dataSource ?? 'demo'}:${item.id}`} className="rec-card">
                <ListingImage
                  alt={item.title}
                  className="rec-card-image"
                  height={130}
                  src={item.images[0]}
                  unoptimized
                  width={220}
                />
                <div className="rec-card-content">
                  {reason ? <div className="rec-reason-badge">
                    <Sparkles size={11} />
                    <span>{reason}</span>
                  </div> : null}
                  <h3
                    style={{
                      fontSize: '0.86rem',
                      fontWeight: 700,
                      lineHeight: 1.3,
                      marginBottom: 4,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.title}
                  </h3>
                  <div style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    {item.price.toLocaleString()}원
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 2-Column Product Grid */}
      <section>
        <div className="section-header">
          <h2 className="section-title">
            <span>방금 등록된 장비</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 600 }}>
              {isLoading ? '…' : `현재 표시 ${filteredListings.length}개`}
            </span>
          </h2>
        </div>

        {isLoading ? null : filteredListings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 6 }}>
              검색 결과가 없습니다
            </p>
            <p style={{ fontSize: '0.85rem' }}>다른 키워드나 스포츠를 선택해보세요.</p>
          </div>
        ) : (
          <div className="product-grid">
            {filteredListings.map((item) => (
              <WebListingCard
                favorite={favorites[item.dataSource === 'go' ? `go:${item.id}` : item.id] ?? false}
                key={`${item.dataSource ?? 'demo'}:${item.id}`}
                listing={item}
                onFavorite={updateFavorite}
              />
            ))}
          </div>
        )}
      </section>
    </MobileShell>
  );
}

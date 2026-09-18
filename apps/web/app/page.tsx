'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { WebListingCard } from '@/components/listings/WebListingCard';
import { MobileShell } from '@/components/layout/MobileShell';
import { useFavorites } from '@/lib/listings/use-favorites';
import { useListings } from '@/lib/listings/use-listings';
import { Search, Sparkles, ChevronRight, Waves, Flame } from 'lucide-react';

export default function HomePage() {
  const { listings: allListings } = useListings();
  const [selectedSport, setSelectedSport] = useState<'all' | 'surf' | 'tennis'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { favorites, updateFavorite } = useFavorites();

  const filteredListings = allListings.filter((item) => {
    const matchesSport = selectedSport === 'all' || item.sport === selectedSport;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sportLabel.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSport && matchesSearch;
  });

  const recommendedListings = allListings.filter((item) => item.recommendationReason);

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
      {searchQuery === '' && selectedSport === 'all' && (
        <section style={{ marginBottom: 12 }}>
          <div className="section-header">
            <h2 className="section-title">
              <Sparkles size={18} color="var(--accent)" />
              <span>맞춤 장비 추천</span>
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

          <div className="recommendation-rail">
            {recommendedListings.map((item) => (
              <Link href={`/market/${item.id}`} key={item.id} className="rec-card">
                <Image
                  alt={item.title}
                  className="rec-card-image"
                  height={130}
                  src={item.images[0]}
                  unoptimized
                  width={220}
                />
                <div className="rec-card-content">
                  <div className="rec-reason-badge">
                    <Sparkles size={11} />
                    <span>{item.recommendationReason}</span>
                  </div>
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
              {filteredListings.length}개
            </span>
          </h2>
        </div>

        {filteredListings.length === 0 ? (
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
                favorite={favorites[item.id] ?? false}
                key={item.id}
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

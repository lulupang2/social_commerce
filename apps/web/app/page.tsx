'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MobileShell } from '@/components/layout/MobileShell';
import { SUMMER_LISTINGS } from '@/lib/data/summer-mock-data';
import { Search, Heart, Sparkles, MapPin, ChevronRight, Waves, Flame } from 'lucide-react';

export default function HomePage() {
  const [selectedSport, setSelectedSport] = useState<'all' | 'surf' | 'tennis'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<Record<string, boolean>>({
    'surf-001': true,
    'tennis-001': false,
  });

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredListings = SUMMER_LISTINGS.filter((item) => {
    const matchesSport = selectedSport === 'all' || item.sport === selectedSport;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sportLabel.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSport && matchesSearch;
  });

  const recommendedListings = SUMMER_LISTINGS.filter((item) => item.recommendationReason);

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
                <img src={item.images[0]} alt={item.title} className="rec-card-image" />
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
            {filteredListings.map((item) => {
              const isFav = favorites[item.id] ?? false;
              return (
                <Link href={`/market/${item.id}`} key={item.id} className="product-card">
                  <div className="product-card-img-wrapper">
                    <img src={item.images[0]} alt={item.title} className="product-card-img" />
                    <button
                      className="favorite-btn"
                      onClick={(e) => toggleFavorite(item.id, e)}
                      aria-label="찜하기"
                    >
                      <Heart
                        size={17}
                        color={isFav ? 'var(--danger)' : 'var(--text-muted)'}
                        fill={isFav ? 'var(--danger)' : 'none'}
                      />
                    </button>
                  </div>

                  <div className="product-card-info">
                    <div className="product-sport-tag">
                      {item.sportLabel} · {item.conditionLabel}
                    </div>
                    <h3 className="product-title">{item.title}</h3>
                    <div className="product-spec-row">
                      <MapPin size={12} />
                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.location.split(' ')[0]} {item.location.split(' ')[1]}
                      </span>
                    </div>
                    <div className="product-price">{item.price.toLocaleString()}원</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </MobileShell>
  );
}

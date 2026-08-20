'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MobileShell } from '@/components/layout/MobileShell';
import { SUMMER_LISTINGS } from '@/lib/data/summer-mock-data';
import { Search, Heart, MapPin, Filter, SlidersHorizontal } from 'lucide-react';

export default function MarketPage() {
  const [selectedSport, setSelectedSport] = useState<'all' | 'surf' | 'tennis'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<Record<string, boolean>>({
    'surf-001': true,
  });

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredListings = SUMMER_LISTINGS.filter((item) => {
    const matchesSport = selectedSport === 'all' || item.sport === selectedSport;
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSport && matchesCategory && matchesSearch;
  });

  return (
    <MobileShell title="마켓 둘러보기">
      {/* Search Input */}
      <div className="search-container">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="서프보드, 웻슈트, 테니스 라켓 등 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Sport Selector */}
      <div className="sport-tabs">
        <button
          className={`sport-tab ${selectedSport === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedSport('all')}
        >
          전체
        </button>
        <button
          className={`sport-tab ${selectedSport === 'surf' ? 'active' : ''}`}
          onClick={() => setSelectedSport('surf')}
        >
          🏄‍♂️ 서핑
        </button>
        <button
          className={`sport-tab ${selectedSport === 'tennis' ? 'active' : ''}`}
          onClick={() => setSelectedSport('tennis')}
        >
          🎾 테니스
        </button>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px 14px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
          총 <span style={{ color: 'var(--primary)' }}>{filteredListings.length}</span>개의 장비
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              fontSize: '0.8rem',
              background: 'var(--surface)',
              fontWeight: 600,
            }}
          >
            <option value="all">전체 카테고리</option>
            <option value="equipment">장비/보드/라켓</option>
            <option value="apparel">의류/웻슈트</option>
            <option value="footwear">신발/풋웨어</option>
            <option value="accessories">액세서리/용품</option>
          </select>
        </div>
      </div>

      {/* Product List */}
      {filteredListings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 16px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 6 }}>
            조건에 맞는 상품이 없습니다
          </p>
          <p style={{ fontSize: '0.85rem' }}>필터를 초기화하거나 다른 검색어를 입력해보세요.</p>
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
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {item.location}
                    </span>
                  </div>
                  <div className="product-price">{item.price.toLocaleString()}원</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </MobileShell>
  );
}

'use client';

import React, { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/layout/MobileShell';
import { SUMMER_LISTINGS } from '@/lib/data/summer-mock-data';
import {
  Heart,
  MessageCircle,
  Share2,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  ChevronLeft,
} from 'lucide-react';

export default function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const listing =
    SUMMER_LISTINGS.find((item) => item.id === resolvedParams.id) || SUMMER_LISTINGS[0];

  return (
    <MobileShell hideNav showBack>
      <div className="detail-container">
        {/* Gallery */}
        <div className="detail-gallery">
          <img src={listing.images[activeImageIndex] || listing.images[0]} alt={listing.title} />
          {listing.images.length > 1 && (
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                right: 14,
                background: 'rgba(0, 0, 0, 0.65)',
                color: '#fff',
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              {activeImageIndex + 1} / {listing.images.length}
            </div>
          )}
        </div>

        {/* Thumbnail Selector if multiple */}
        {listing.images.length > 1 && (
          <div
            style={{ display: 'flex', gap: 8, padding: '10px 16px', background: 'var(--surface)' }}
          >
            {listing.images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setActiveImageIndex(idx)}
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 8,
                  overflow: 'hidden',
                  border:
                    activeImageIndex === idx
                      ? '2px solid var(--primary)'
                      : '1px solid var(--border)',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                <img
                  src={img}
                  alt="thumb"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </button>
            ))}
          </div>
        )}

        {/* Body Content */}
        <div className="detail-body">
          {/* Recommendation badge if present */}
          {listing.recommendationReason && (
            <div
              className="rec-reason-badge"
              style={{ marginBottom: 8, fontSize: '0.78rem', padding: '4px 10px' }}
            >
              <Sparkles size={13} />
              <span>{listing.recommendationReason}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)' }}>
              {listing.sportLabel}
            </span>
            <span style={{ color: 'var(--text-subtle)' }}>·</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {listing.conditionLabel}
            </span>
            <span style={{ color: 'var(--text-subtle)' }}>·</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {listing.createdAt}
            </span>
          </div>

          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.35, marginBottom: 12 }}>
            {listing.title}
          </h1>

          <div
            style={{
              fontSize: '1.45rem',
              fontWeight: 900,
              color: 'var(--text-main)',
              marginBottom: 16,
            }}
          >
            {listing.price.toLocaleString()}원
          </div>

          {/* Seller Card */}
          <div className="detail-seller-card">
            <img
              src={listing.seller.avatar}
              alt={listing.seller.name}
              style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>{listing.seller.name}</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                }}
              >
                <Star size={12} color="#f59e0b" fill="#f59e0b" />
                <span>{listing.seller.rating}</span>
                <span>·</span>
                <span>거래 {listing.seller.transactionCount}회</span>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--primary)',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}
            >
              <ShieldCheck size={16} />
              <span>본인인증 완료</span>
            </div>
          </div>

          {/* Equipment Specs */}
          <div style={{ margin: '20px 0' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: 8 }}>
              {listing.sportLabel} 장비 상세 스펙
            </h3>
            <div className="spec-grid">
              {Object.entries(listing.specs).map(([key, val]) => (
                <div key={key} className="spec-item">
                  <span className="spec-label">{key}</span>
                  <span className="spec-val">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div style={{ margin: '20px 0' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: 8 }}>상품 설명</h3>
            <p
              style={{
                fontSize: '0.92rem',
                lineHeight: 1.6,
                color: 'var(--text-main)',
                whiteSpace: 'pre-line',
              }}
            >
              {listing.description}
            </p>
          </div>

          {/* Location info */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              margin: '16px 0 24px',
            }}
          >
            <MapPin size={16} color="var(--primary)" />
            <span>
              희망 거래 장소: <strong>{listing.location}</strong>
            </span>
          </div>
        </div>

        {/* Sticky Action Footer */}
        <div className="sticky-bottom-action">
          <button
            onClick={() => setIsFavorite(!isFavorite)}
            className="btn-outline"
            style={{ minWidth: 48, padding: '12px 14px' }}
            aria-label="찜하기"
          >
            <Heart
              size={20}
              color={isFavorite ? 'var(--danger)' : 'var(--text-main)'}
              fill={isFavorite ? 'var(--danger)' : 'none'}
            />
          </button>

          <Link href={`/chat/chat-001`} className="btn-primary" style={{ flex: 1 }}>
            <MessageCircle size={18} />
            <span>채팅으로 거래하기</span>
          </Link>
        </div>
      </div>
    </MobileShell>
  );
}

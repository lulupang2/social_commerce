'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MobileShell } from '@/components/layout/MobileShell';
import { SUMMER_COMMUNITY_POSTS } from '@/lib/data/summer-mock-data';
import { Heart, MessageSquare, Plus, Waves, Trophy, Flame } from 'lucide-react';

export default function CommunityPage() {
  const [selectedSport, setSelectedSport] = useState<'all' | 'surf' | 'tennis'>('all');
  const [likes, setLikes] = useState<Record<string, { count: number; liked: boolean }>>({
    'post-001': { count: 48, liked: false },
    'post-002': { count: 62, liked: true },
    'post-003': { count: 31, liked: false },
    'post-004': { count: 27, liked: false },
  });

  const toggleLike = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLikes((prev) => {
      const current = prev[id] || { count: 0, liked: false };
      return {
        ...prev,
        [id]: {
          count: current.liked ? current.count - 1 : current.count + 1,
          liked: !current.liked,
        },
      };
    });
  };

  const filteredPosts = SUMMER_COMMUNITY_POSTS.filter(
    (p) => selectedSport === 'all' || p.sport === selectedSport,
  );

  return (
    <MobileShell title="서핑 & 테니스 커뮤니티">
      {/* Category Tabs */}
      <div className="sport-tabs" style={{ paddingTop: 12 }}>
        <button
          className={`sport-tab ${selectedSport === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedSport('all')}
        >
          <Flame size={16} />
          <span>전체 라운지</span>
        </button>
        <button
          className={`sport-tab ${selectedSport === 'surf' ? 'active' : ''}`}
          onClick={() => setSelectedSport('surf')}
        >
          <span>🏄‍♂️ 서핑 라운지</span>
        </button>
        <button
          className={`sport-tab ${selectedSport === 'tennis' ? 'active' : ''}`}
          onClick={() => setSelectedSport('tennis')}
        >
          <span>🎾 테니스 라운지</span>
        </button>
      </div>

      {/* Floating Create Post Button */}
      <Link
        href="/community/create"
        style={{
          position: 'fixed',
          bottom: 80,
          right: 'calc(50% - 220px)',
          background: 'var(--primary)',
          color: '#fff',
          padding: '12px 18px',
          borderRadius: 'var(--radius-full)',
          boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: 700,
          fontSize: '0.88rem',
          zIndex: 40,
        }}
      >
        <Plus size={18} />
        <span>글쓰기</span>
      </Link>

      {/* Post List */}
      <div>
        {filteredPosts.map((post) => {
          const likeState = likes[post.id] || { count: post.likes, liked: false };
          return (
            <Link
              href={`/community/${post.id}`}
              key={post.id}
              className="feed-card"
              style={{ display: 'block', textDecoration: 'none' }}
            >
              {/* Author & Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <img
                  src={post.author.avatar}
                  alt={post.author.name}
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                />
                <div>
                  <div
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{post.author.name}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600 }}>
                      {post.author.level}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                    {post.createdAt} ·{' '}
                    <span style={{ color: 'var(--accent-hover)', fontWeight: 600 }}>
                      {post.categoryLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Title & Content */}
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 6, lineHeight: 1.35 }}>
                {post.title}
              </h3>
              <p
                style={{
                  fontSize: '0.88rem',
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                  marginBottom: 10,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {post.content}
              </p>

              {/* Image if present */}
              {post.image && (
                <div
                  style={{
                    width: '100%',
                    height: 180,
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    marginBottom: 12,
                  }}
                >
                  <img
                    src={post.image}
                    alt="post"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              )}

              {/* Footer Reactions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  color: 'var(--text-muted)',
                  fontSize: '0.82rem',
                }}
              >
                <button
                  onClick={(e) => toggleLike(post.id, e)}
                  style={{
                    background: 'none',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    color: likeState.liked ? 'var(--danger)' : 'inherit',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Heart size={16} fill={likeState.liked ? 'var(--danger)' : 'none'} />
                  <span>{likeState.count}</span>
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                  <MessageSquare size={16} />
                  <span>{post.comments}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </MobileShell>
  );
}

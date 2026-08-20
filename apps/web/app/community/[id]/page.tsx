'use client';

import React, { useState, use } from 'react';
import { MobileShell } from '@/components/layout/MobileShell';
import { SUMMER_COMMUNITY_POSTS } from '@/lib/data/summer-mock-data';
import { Heart, MessageSquare, Send, Share2, MoreVertical } from 'lucide-react';

export default function CommunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const post =
    SUMMER_COMMUNITY_POSTS.find((p) => p.id === resolvedParams.id) || SUMMER_COMMUNITY_POSTS[0];

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [commentInput, setCommentInput] = useState('');
  const [comments, setComments] = useState([
    {
      id: 'c1',
      author: '바다사나이',
      avatar:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
      text: '정말 유익한 정보 감사합니다! 이번 주말에 양양 갈 예정인데 꼭 참고할게요.',
      time: '2시간 전',
    },
    {
      id: 'c2',
      author: '서프초보',
      avatar:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
      text: '피크 우선권 헷갈렸는데 깔끔하게 이해됐습니다 ㅎㅎ',
      time: '1시간 전',
    },
  ]);

  const handleLike = () => {
    if (liked) {
      setLikeCount(likeCount - 1);
      setLiked(false);
    } else {
      setLikeCount(likeCount + 1);
      setLiked(true);
    }
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;

    setComments([
      ...comments,
      {
        id: `c-${Date.now()}`,
        author: '나 (게스트)',
        avatar:
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
        text: commentInput,
        time: '방금 전',
      },
    ]);
    setCommentInput('');
  };

  return (
    <MobileShell showBack hideNav>
      <div style={{ paddingBottom: 80 }}>
        {/* Post Main */}
        <div
          style={{
            padding: '16px 16px 20px',
            borderBottom: '8px solid var(--surface-subtle)',
            background: 'var(--surface)',
          }}
        >
          {/* Author */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <img
              src={post.author.avatar}
              alt={post.author.name}
              style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 800 }}>{post.author.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {post.author.level} · {post.createdAt}
              </div>
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--accent-hover)',
                background: 'var(--accent-light)',
                padding: '3px 8px',
                borderRadius: 'var(--radius-full)',
              }}
            >
              {post.categoryLabel}
            </span>
          </div>

          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.35, marginBottom: 12 }}>
            {post.title}
          </h1>

          <p
            style={{
              fontSize: '0.94rem',
              lineHeight: 1.65,
              color: 'var(--text-main)',
              whiteSpace: 'pre-line',
              marginBottom: 16,
            }}
          >
            {post.content}
          </p>

          {post.image && (
            <div
              style={{
                width: '100%',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                marginBottom: 16,
              }}
            >
              <img
                src={post.image}
                alt="content"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          )}

          {/* Like / Share Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
            }}
          >
            <button
              onClick={handleLike}
              style={{
                background: liked ? 'var(--accent-light)' : 'var(--surface-subtle)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.85rem',
                fontWeight: 700,
                color: liked ? 'var(--danger)' : 'var(--text-main)',
                cursor: 'pointer',
              }}
            >
              <Heart
                size={16}
                fill={liked ? 'var(--danger)' : 'none'}
                color={liked ? 'var(--danger)' : 'currentColor'}
              />
              <span>좋아요 {likeCount}</span>
            </button>
          </div>
        </div>

        {/* Comment Section */}
        <div style={{ padding: '16px', background: 'var(--surface)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: 14 }}>
            댓글 <span style={{ color: 'var(--primary)' }}>{comments.length}</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {comments.map((c) => (
              <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                <img
                  src={c.avatar}
                  alt={c.author}
                  style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }}
                />
                <div
                  style={{
                    flex: 1,
                    background: 'var(--surface-subtle)',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}
                  >
                    <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{c.author}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                      {c.time}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
                    {c.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sticky Comment Input Bar */}
        <form onSubmit={handleAddComment} className="sticky-bottom-action" style={{ gap: 8 }}>
          <input
            type="text"
            className="form-input"
            placeholder="댓글을 입력해보세요..."
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            style={{ borderRadius: 'var(--radius-full)', padding: '10px 16px' }}
          />
          <button
            type="submit"
            className="btn-primary"
            style={{ width: 44, height: 44, padding: 0, borderRadius: '50%', flexShrink: 0 }}
            aria-label="댓글 작성"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </MobileShell>
  );
}

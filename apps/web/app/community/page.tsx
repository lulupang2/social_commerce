'use client';

import { Flame, Heart, MessageSquare, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import React, { useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import { setCommunityLike } from '@/lib/community/actions';
import { useCommunityPosts } from '@/lib/data/use-community-posts';
import { triggerNativeHaptic } from '@/lib/native-bridge';

export default function CommunityPage() {
  const allPosts = useCommunityPosts();
  const [selectedSport, setSelectedSport] = useState<'all' | 'surf' | 'tennis'>('all');
  const [likes, setLikes] = useState<Record<string, { count: number; liked: boolean }>>({});

  const toggleLike = async (postId: string, fallbackCount: number) => {
    const current = likes[postId] ?? { count: fallbackCount, liked: false };
    const next = { count: current.count + (current.liked ? -1 : 1), liked: !current.liked };
    setLikes((state) => ({ ...state, [postId]: next }));
    triggerNativeHaptic('selection');

    const result = await setCommunityLike(postId, next.liked);
    if (!result.ok) {
      setLikes((state) => ({ ...state, [postId]: current }));
      triggerNativeHaptic('error');
    }
  };

  const filteredPosts = allPosts.filter(
    (post) => selectedSport === 'all' || post.sport === selectedSport,
  );

  return (
    <MobileShell title="서핑 & 테니스 커뮤니티">
      <div className="sport-tabs community-tabs" role="group" aria-label="커뮤니티 스포츠">
        <button
          aria-pressed={selectedSport === 'all'}
          className={`sport-tab ${selectedSport === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedSport('all')}
          type="button"
        >
          <Flame size={16} />
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

      <Link className="community-create-fab" href="/community/create">
        <Plus size={18} />
        <span>글쓰기</span>
      </Link>

      <div className="community-feed">
        {filteredPosts.map((post) => {
          const likeState = likes[post.id] ?? { count: post.likes, liked: false };
          return (
            <article className="community-card" key={post.id}>
              <header>
                <Image
                  alt={post.author.name}
                  height={38}
                  src={post.author.avatar}
                  unoptimized
                  width={38}
                />
                <div>
                  <strong>
                    {post.author.name}
                    <small>{post.author.level}</small>
                  </strong>
                  <span>
                    {post.createdAt} · {post.categoryLabel}
                  </span>
                </div>
              </header>

              <Link className="community-card-link" href={`/community/${post.id}`}>
                <h2>{post.title}</h2>
                <p>{post.content}</p>
                {post.image ? (
                  <Image
                    alt={`${post.title} 첨부 사진`}
                    className="community-card-image"
                    height={440}
                    src={post.image}
                    unoptimized
                    width={720}
                  />
                ) : null}
              </Link>

              <footer>
                <button
                  aria-pressed={likeState.liked}
                  className={likeState.liked ? 'liked' : ''}
                  onClick={() => void toggleLike(post.id, post.likes)}
                  type="button"
                >
                  <Heart fill={likeState.liked ? 'currentColor' : 'none'} size={16} />
                  <span>{likeState.count}</span>
                </button>
                <Link href={`/community/${post.id}`}>
                  <MessageSquare size={16} />
                  <span>{post.comments}</span>
                </Link>
              </footer>
            </article>
          );
        })}
      </div>
    </MobileShell>
  );
}

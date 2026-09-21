'use client';

import { Heart, LoaderCircle, Send, Share2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import React, { use, useEffect, useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import {
  addCommunityComment,
  loadCommunityComments,
  setCommunityLike,
} from '@/lib/community/actions';
import { useCommunityPosts } from '@/lib/data/use-community-posts';
import { triggerNativeHaptic } from '@/lib/native-bridge';

interface CommentItem {
  id: string;
  author: string;
  avatar: string;
  text: string;
  time: string;
}

const DEMO_COMMENTS: CommentItem[] = [
  {
    id: 'demo-comment-1',
    author: '바다사나이',
    avatar:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
    text: '정말 유익한 정보 감사합니다! 이번 주말 세션 전에 꼭 다시 볼게요.',
    time: '2시간 전',
  },
  {
    id: 'demo-comment-2',
    author: '서프초보',
    avatar:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
    text: '헷갈렸던 부분을 깔끔하게 이해했어요.',
    time: '1시간 전',
  },
];

function commentTime(timestamp: string): string {
  const value = new Date(timestamp).getTime();
  if (!Number.isFinite(value)) return '방금 전';
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000));
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}

export default function CommunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const posts = useCommunityPosts();
  const post = posts.find((item) => item.id === id) ?? null;
  const [liked, setLiked] = useState(false);
  const [likeDelta, setLikeDelta] = useState(0);
  const [commentInput, setCommentInput] = useState('');
  const [comments, setComments] = useState<CommentItem[]>(
    id.startsWith('post-') ? DEMO_COMMENTS : [],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!post) return;

    let active = true;
    void loadCommunityComments(post.id).then((items) => {
      if (!active || items === null) return;
      setComments(
        items.map((comment) => ({
          id: comment.id,
          author: comment.author,
          avatar: post.author.avatar,
          text: comment.body,
          time: commentTime(comment.createdAt),
        })),
      );
    });
    return () => {
      active = false;
    };
  }, [post]);

  if (!post) {
    return (
      <MobileShell title="게시글을 찾을 수 없어요" showBack hideNav>
        <div className="empty-state">
          <p>삭제되었거나 존재하지 않는 게시글이에요.</p>
          <Link className="btn-primary" href="/community">
            커뮤니티로 돌아가기
          </Link>
        </div>
      </MobileShell>
    );
  }

  const likeCount = post.likes + likeDelta;

  const toggleLike = async () => {
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeDelta((delta) => delta + (nextLiked ? 1 : -1));
    setActionError('');
    triggerNativeHaptic('selection');

    const result = await setCommunityLike(post.id, nextLiked);
    if (!result.ok) {
      setLiked(!nextLiked);
      setLikeDelta((delta) => delta + (nextLiked ? -1 : 1));
      setActionError(result.message);
      triggerNativeHaptic('error');
    }
  };

  const addComment = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = commentInput.trim();
    if (!body || isSubmitting) return;
    setActionError('');
    setIsSubmitting(true);

    const result = await addCommunityComment(post.id, body);
    if (result.ok) {
      setComments((current) => [
        ...current,
        {
          id: result.comment.id,
          author: result.comment.author,
          avatar: post.author.avatar,
          text: result.comment.body,
          time: '방금 전',
        },
      ]);
      setCommentInput('');
      triggerNativeHaptic('success');
    } else if (post.id.startsWith('post-') || post.id.startsWith('local-post-')) {
      setComments((current) => [
        ...current,
        {
          id: `local-comment-${Date.now()}`,
          author: '나 (기기 데모)',
          avatar: post.author.avatar,
          text: body,
          time: '방금 전',
        },
      ]);
      setCommentInput('');
      triggerNativeHaptic('success');
    } else {
      setActionError(result.message);
      triggerNativeHaptic('error');
    }
    setIsSubmitting(false);
  };

  const sharePost = async () => {
    try {
      if (navigator.share)
        await navigator.share({ title: post.title, text: post.title, url: window.location.href });
      else await navigator.clipboard.writeText(window.location.href);
      triggerNativeHaptic('success');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setActionError('게시글을 공유하지 못했어요.');
    }
  };

  return (
    <MobileShell showBack hideNav>
      <article className="community-detail">
        <header className="community-author-row">
          <Image
            alt={post.author.name}
            height={44}
            src={post.author.avatar}
            unoptimized
            width={44}
          />
          <div>
            <strong>{post.author.name}</strong>
            <span>
              {post.author.level} · {post.createdAt}
            </span>
          </div>
          <b>{post.categoryLabel}</b>
        </header>

        <h1>{post.title}</h1>
        <p className="community-post-body">{post.content}</p>
        {post.image ? (
          <Image
            alt={`${post.title} 첨부 사진`}
            className="community-hero-image"
            height={560}
            src={post.image}
            unoptimized
            width={840}
          />
        ) : null}

        <div className="community-action-row">
          <button
            aria-pressed={liked}
            className={liked ? 'liked' : ''}
            onClick={() => void toggleLike()}
            type="button"
          >
            <Heart fill={liked ? 'currentColor' : 'none'} size={17} />
            좋아요 {likeCount}
          </button>
          <button onClick={() => void sharePost()} type="button">
            <Share2 size={17} />
            공유
          </button>
        </div>
      </article>

      <section className="comment-section">
        <h2>
          댓글 <strong>{comments.length}</strong>
        </h2>
        {comments.length === 0 ? (
          <p className="comment-empty">첫 댓글로 이야기를 이어가 보세요.</p>
        ) : null}
        <div className="comment-list">
          {comments.map((comment) => (
            <article key={comment.id}>
              <Image alt="" height={36} src={comment.avatar} unoptimized width={36} />
              <div>
                <header>
                  <strong>{comment.author}</strong>
                  <time>{comment.time}</time>
                </header>
                <p>{comment.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {actionError ? (
        <p className="chat-error community-error" role="alert">
          {actionError}
        </p>
      ) : null}
      <form
        className="sticky-bottom-action comment-composer"
        onSubmit={(event) => void addComment(event)}
      >
        <label className="visually-hidden" htmlFor="comment-input">
          댓글
        </label>
        <input
          className="form-input"
          id="comment-input"
          maxLength={5000}
          onChange={(event) => setCommentInput(event.target.value)}
          placeholder="댓글을 입력하세요"
          value={commentInput}
        />
        <button
          aria-label="댓글 작성"
          className="btn-primary"
          disabled={isSubmitting || !commentInput.trim()}
          type="submit"
        >
          {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
        </button>
      </form>
    </MobileShell>
  );
}

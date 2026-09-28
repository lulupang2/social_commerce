'use client';

import { Heart, LoaderCircle, Send, Share2 } from 'lucide-react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/display-format';
import { use, useEffect, useState } from 'react';
import { StatePanel } from '@/components/ui/StatePanel';
import { MobileShell } from '@/components/layout/MobileShell';
import { changeLike, createComment, getPost, listComments, type CommunityComment, type CommunityPost } from '@/lib/community/client';
import { getGoSession } from '@/lib/go-auth/client';

export default function CommunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [memberId, setMemberId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);
  const [actionError, setActionError] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([getPost(id), listComments(id), getGoSession()]).then(([postResult, commentResult, session]) => {
      if (!active) return;
      if (postResult.ok && commentResult.ok) {
        setPost(postResult.data); setComments(commentResult.data.items); setError('');
        if (session.ok) setMemberId(session.session.member.id);
      } else {
        const failure = !postResult.ok ? postResult : !commentResult.ok ? commentResult : null;
        setError(failure?.message ?? '게시글을 불러올 수 없어요.');
        setErrorStatus(failure?.status ?? 0);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [id, generation]);
  const toggle = async () => {
    if (!post || busy) return;
    setBusy(true);
    const result = await changeLike(id, !post.liked);
    if (result.ok) { setPost((current) => current ? { ...current, liked: result.data.liked, likes: result.data.likes } : null); setActionError(''); }
    else setActionError(result.message);
    setBusy(false);
  };
  const comment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true);
    const result = await createComment(id, input.trim());
    if (result.ok) { setComments((items) => [...items, result.data]); setInput(''); setActionError(''); }
    else setActionError(result.message);
    setBusy(false);
  };
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: post?.title, url: window.location.href }); else await navigator.clipboard.writeText(window.location.href); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setActionError('게시글을 공유하지 못했어요.'); }
  };
  if (loading) return <MobileShell title="게시글 불러오는 중" showBack hideNav><StatePanel role="status" icon={<LoaderCircle className="spin" size={24} />} description="게시글을 불러오는 중이에요." /></MobileShell>;
  if (error || !post) return <MobileShell title="게시글을 열 수 없어요" showBack hideNav><StatePanel role="alert" description={error || '공개되지 않았거나 존재하지 않는 게시글이에요.'} actions={<>
    {errorStatus === 401 ? <Link className="btn-primary" href="/auth">로그인하기</Link> : errorStatus !== 403 && errorStatus !== 404 ? <button className="btn-outline" type="button" onClick={() => { setLoading(true); setGeneration((n) => n + 1); }}>다시 시도</button> : null}<Link href="/community">커뮤니티로</Link>
  </>} /></MobileShell>;
  return <MobileShell showBack hideNav>
    <article className="community-detail">
      <header className="community-author-row"><div className="chat-avatar">{post.authorName.slice(0, 1)}</div><div><strong>{post.authorName}</strong><span>{formatDateTime(post.createdAt)}</span></div><b>{post.sport === 'surf' ? '서핑' : '테니스'}</b></header>
      <h1>{post.title}</h1><p className="community-post-body">{post.body}</p>
      {post.authorId === memberId && post.status !== 'active' ? <Link href={`/community/${id}/edit`}>게시글 수정 · 검토 상태</Link> : null}
      <div className="community-action-row"><button type="button" disabled={busy || post.status !== 'active'} aria-pressed={post.liked} className={post.liked ? 'liked' : ''} onClick={() => void toggle()}><Heart size={17} fill={post.liked ? 'currentColor' : 'none'} />좋아요 {post.likes}</button><button type="button" onClick={() => void share()}><Share2 size={17} />공유</button></div>
    </article>
    <section className="comment-section"><h2>댓글 <strong>{comments.length}</strong></h2><div className="comment-list">{comments.map((item) => <article key={item.id}><div className="chat-avatar">{item.author.slice(0, 1)}</div><div><header><strong>{item.author}</strong><time>{formatDateTime(item.createdAt)}</time></header><p>{item.body}</p></div></article>)}</div></section>
    {actionError ? <p className="chat-error community-error" role="alert">{actionError}</p> : null}
    <form className="sticky-bottom-action comment-composer" onSubmit={(event) => void comment(event)}><label className="visually-hidden" htmlFor="comment-input">댓글</label><input id="comment-input" className="form-input" value={input} maxLength={5000} onChange={(event) => setInput(event.target.value)} placeholder="댓글을 입력하세요" /><button className="btn-primary" type="submit" aria-label="댓글 작성" disabled={busy || !input.trim()}><Send size={18} /></button></form>
  </MobileShell>;
}

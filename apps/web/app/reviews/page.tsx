'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ListingImage } from '@/components/media/ListingImage';
import { StatePanel } from '@/components/ui/StatePanel';
import { formatWon } from '@/lib/display-format';
import { MobileShell } from '@/components/layout/MobileShell';
import type { GoListing } from '@/lib/go-listings/client';
import { decideReview, reviewQueue } from '@/lib/go-listings/reviews';
import { reviewPost, reviewPosts, type CommunityPost } from '@/lib/community/client';

export default function ReviewsPage() {
  const [items, setItems] = useState<GoListing[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void Promise.all([reviewQueue(), reviewPosts()]).then(([result, community]) => {
      if (!active) return;
      if (result.ok && community.ok) { setItems(result.data.items); setPosts(community.data.items); setError(''); }
      else {
        const failure = !result.ok ? result : !community.ok ? community : null;
        setError(failure?.status === 403 ? '검토 담당자만 접근할 수 있어요.' : failure?.message ?? '');
        setErrorStatus(failure?.status ?? 0);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [generation]);
  const decide = async (id: string, action: 'approve' | 'reject') => {
    const reason = reasons[id]?.trim() ?? '';
    if (action === 'reject' && !reason) { setError('반려 사유를 입력해 주세요.'); setErrorStatus(400); return; }
    setBusy(id);
    const result = await decideReview(id, action, reason);
    if (result.ok) { setItems((current) => current.filter((item) => item.id !== id)); setError(''); }
    else { setError(result.message); setErrorStatus(result.status); }
    setBusy(null);
  };
  const decidePost = async (id: string, action: 'approve' | 'reject') => {
    const reason = reasons[id]?.trim() ?? '';
    if (action === 'reject' && !reason) { setError('게시글 반려 사유를 입력해 주세요.'); setErrorStatus(400); return; }
    setBusy(id);
    const result = await reviewPost(id, action, reason);
    if (result.ok) { setPosts((current) => current.filter((item) => item.id !== id)); setError(''); }
    else { setError(result.message); setErrorStatus(result.status); }
    setBusy(null);
  };
  return <MobileShell title="매물 검토" showBack>
    <div style={{ padding: 16 }}>
      <Link href="/profile">← 마이페이지</Link>
      <h1>검토 대기 매물</h1>
      {error ? <StatePanel role="alert" description={error} actions={errorStatus === 401 ? <Link href="/auth" className="btn-primary">로그인하기</Link> : errorStatus === 403 ? <Link href="/profile">마이페이지로</Link> : errorStatus === 400 ? undefined : <button type="button" className="btn-outline" onClick={() => { setLoading(true); setError(''); setGeneration((value) => value + 1); }}>다시 시도</button>} /> : null}
      {loading ? <StatePanel role="status" description="검토 대기 매물을 불러오는 중이에요." /> : null}
      {!loading && !error && items.length === 0 ? <StatePanel description="검토 대기 매물이 없어요." /> : null}
      {items.map((item) => <article key={item.id} className="product-card" style={{ padding: 16, marginBlock: 12 }}>
        <h2>{item.title}</h2>
        <p>{item.sport} · {formatWon(item.priceKrw)}</p>
        <p>{item.description}</p>
        <p>사진 {item.images.length}장</p>
        {item.images.map((image) => <ListingImage key={image.id} src={image.url} alt={`${item.title} 검토 사진`} width={320} height={240} unoptimized style={{ maxWidth: '100%', objectFit: 'contain' }} />)}
        <label htmlFor={`reason-${item.id}`}>반려 사유</label>
        <textarea id={`reason-${item.id}`} value={reasons[item.id] ?? ''} maxLength={1000} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void decide(item.id, 'approve')}>승인</button>
          <button type="button" className="btn-outline" disabled={busy !== null} onClick={() => void decide(item.id, 'reject')}>반려</button>
        </div>
      </article>)}
      <h1>검토 대기 게시글</h1>
      {!loading && !error && posts.length === 0 ? <StatePanel description="검토 대기 게시글이 없어요." /> : null}
      {posts.map((post) => <article key={post.id} className="product-card" style={{ padding: 16, marginBlock: 12 }}>
        <h2>{post.title}</h2><p>{post.sport} · {post.authorName}</p><p>{post.body}</p>
        <label htmlFor={`post-reason-${post.id}`}>게시글 반려 사유</label>
        <textarea id={`post-reason-${post.id}`} maxLength={1000} value={reasons[post.id] ?? ''} onChange={(event) => setReasons((value) => ({ ...value, [post.id]: event.target.value }))} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void decidePost(post.id, 'approve')}>게시글 승인</button>
          <button type="button" className="btn-outline" disabled={busy !== null} onClick={() => void decidePost(post.id, 'reject')}>게시글 반려</button>
        </div>
      </article>)}
    </div>
  </MobileShell>;
}

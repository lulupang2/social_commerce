'use client';

import { Flame, Heart, MessageSquare, Plus } from 'lucide-react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/display-format';
import { useState } from 'react';
import { StatePanel } from '@/components/ui/StatePanel';
import { MobileShell } from '@/components/layout/MobileShell';
import { changeLike } from '@/lib/community/client';
import { useCommunityPosts } from '@/lib/data/use-community-posts';

const labels = { guide: '스포츠 꿀팁', review: '장비 사용기', meetup: '세션 / 모임', discussion: '자유 수다 / Q&A' };
export default function CommunityPage() {
  const { posts, loading, error, retry } = useCommunityPosts();
  const [sport, setSport] = useState<'all' | 'surf' | 'tennis'>('all');
  const [likes, setLikes] = useState<Record<string, { count: number; liked: boolean }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const toggle = async (id: string, liked: boolean) => {
    setBusy(id);
    const result = await changeLike(id, !liked);
    if (result.ok) { setLikes((value) => ({ ...value, [id]: { count: result.data.likes, liked: result.data.liked } })); setActionError(''); }
    else setActionError(result.message);
    setBusy(null);
  };
  return <MobileShell title="서핑 & 테니스 커뮤니티">
    <div className="sport-tabs community-tabs" role="group" aria-label="커뮤니티 스포츠">
      {(['all', 'surf', 'tennis'] as const).map((value) => <button key={value} className={`sport-tab ${sport === value ? 'active' : ''}`} aria-pressed={sport === value} onClick={() => setSport(value)} type="button">{value === 'all' ? <><Flame size={16} />전체</> : value === 'surf' ? '서핑' : '테니스'}</button>)}
    </div>
    <Link className="community-create-fab" href="/community/create"><Plus size={18} />글쓰기</Link>
    <Link href="/my/posts" className="btn-outline" style={{ margin: 16 }}>내 게시글 / 검토 상태</Link>
    {loading ? <StatePanel role="status" description="게시글을 불러오는 중이에요." /> : null}
    {error ? <StatePanel role="alert" description={error} actions={<button className="btn-outline" type="button" onClick={retry}>다시 시도</button>} /> : null}
    {actionError ? <p role="alert" className="form-error">{actionError}</p> : null}
    {!loading && !error && posts.length === 0 ? <StatePanel description="공개된 게시글이 없어요." /> : null}
    <div className="community-feed">{!error && posts.filter((post) => sport === 'all' || post.sport === sport).map((post) => {
      const like = likes[post.id] ?? { count: post.likes, liked: post.liked };
      return <article className="community-card" key={post.id}>
        <header><div className="chat-avatar">{post.authorName.slice(0, 1)}</div><div><strong>{post.authorName}</strong><span>{formatDateTime(post.publishedAt ?? post.createdAt)} · {labels[post.type]}</span></div></header>
        <Link className="community-card-link" href={`/community/${post.id}`}><h2>{post.title}</h2><p>{post.body}</p></Link>
        <footer><button type="button" disabled={busy === post.id} aria-pressed={like.liked} className={like.liked ? 'liked' : ''} onClick={() => void toggle(post.id, like.liked)}><Heart size={16} fill={like.liked ? 'currentColor' : 'none'} />{like.count}</button><Link href={`/community/${post.id}`}><MessageSquare size={16} />{post.comments}</Link></footer>
      </article>;
    })}</div>
  </MobileShell>;
}

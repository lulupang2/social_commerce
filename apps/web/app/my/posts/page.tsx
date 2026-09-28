'use client';

import Link from 'next/link';
import { formatDateTime } from '@/lib/display-format';
import { useCallback, useEffect, useState } from 'react';
import { StatePanel } from '@/components/ui/StatePanel';
import { MobileShell } from '@/components/layout/MobileShell';
import { listMyPosts, resubmitPost, type CommunityPost } from '@/lib/community/client';

const status = { pending_review: '검토 대기', rejected: '반려', active: '공개됨' };
export default function MyPostsPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const result = await listMyPosts();
    if (result.ok) { setPosts(result.data.items); setError(''); }
    else { setError(result.message); setErrorStatus(result.status); }
    setLoading(false);
  }, []);
  useEffect(() => { let active = true; void listMyPosts().then((result) => { if (!active) return; if (result.ok) setPosts(result.data.items); else { setError(result.message); setErrorStatus(result.status); } setLoading(false); }); return () => { active = false; }; }, []);
  const resubmit = async (id: string) => {
    setBusy(id);
    const result = await resubmitPost(id);
    if (result.ok) { setPosts((items) => items.map((item) => item.id === id ? result.data : item)); setError(''); }
    else { setError(result.message); setErrorStatus(result.status); }
    setBusy(null);
  };
  return <MobileShell title="내 게시글" showBack><div style={{ padding: 16 }}>
    <Link href="/community/create" className="btn-primary">게시글 작성</Link>
    {loading ? <StatePanel role="status" description="내 게시글을 불러오는 중이에요." /> : null}
    {error ? <StatePanel role="alert" description={error} actions={errorStatus === 401 ? <Link href="/auth" className="btn-primary">로그인하기</Link> : errorStatus === 403 ? <Link href="/community">커뮤니티로</Link> : <button className="btn-outline" type="button" onClick={() => { setLoading(true); setError(''); void load(); }}>다시 시도</button>} /> : null}
    {!loading && !error && posts.length === 0 ? <StatePanel description="작성한 게시글이 없어요." /> : null}
    {posts.map((post) => <article key={post.id} className="product-card" style={{ padding: 16, marginBlock: 12 }}>
      <h2>{post.title}</h2><p>{status[post.status]} · {formatDateTime(post.updatedAt)}</p>
      {post.reason ? <p role="status">반려 사유: {post.reason}</p> : null}
      <p>{post.body}</p>
      {post.status === 'active' ? <Link href={`/community/${post.id}`}>게시글 보기</Link> : <Link href={`/community/${post.id}/edit`}>내용 수정</Link>}
      {post.status === 'rejected' ? <button className="btn-outline" type="button" disabled={busy !== null} onClick={() => void resubmit(post.id)}>다시 검토 요청</button> : null}
    </article>)}
  </div></MobileShell>;
}

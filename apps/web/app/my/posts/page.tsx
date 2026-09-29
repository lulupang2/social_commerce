'use client';

import Link from 'next/link';
import { formatDateTime } from '@/lib/display-format';
import { useCallback, useEffect, useState } from 'react';
import { StatePanel } from '@/components/ui/StatePanel';
import { MobileShell } from '@/components/layout/MobileShell';
import { listMyPosts, resubmitPost, type CommunityPost } from '@/lib/community/client';
import styles from '@/app/community/community.module.css';

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
  return <MobileShell title="내 게시글" showBack><div className={styles.content}>
    <div className={styles.intro}><p>작성한 글의 공개 여부와 검토 상태를 확인하세요.</p><Link href="/community/create" className="btn-primary">게시글 작성</Link></div>
    {loading ? <StatePanel role="status" description="내 게시글을 불러오는 중이에요." /> : null}
    {error ? <StatePanel role="alert" description={error} actions={errorStatus === 401 ? <Link href="/auth" className="btn-primary">로그인하기</Link> : errorStatus === 403 ? <Link href="/community">커뮤니티로</Link> : <button className="btn-outline" type="button" onClick={() => { setLoading(true); setError(''); void load(); }}>다시 시도</button>} /> : null}
    {!loading && !error && posts.length === 0 ? <StatePanel title="아직 작성한 글이 없어요" description="장비 후기나 궁금한 이야기를 커뮤니티에 나눠보세요." /> : null}
    <div className={styles.list}>{posts.map((post) => <article key={post.id} className={styles.card}>
      <div className={styles.meta}><span className={styles.badge}>{status[post.status]}</span><time dateTime={post.updatedAt}>{formatDateTime(post.updatedAt)} 수정</time></div>
      <h2>{post.title}</h2>
      {post.reason ? <div className={styles.notice}><strong>반려 사유</strong><p>{post.reason}</p></div> : null}
      {post.status === 'rejected' ? <p className={styles.muted}>내용을 확인하고 수정한 뒤 다시 검토를 요청할 수 있어요.</p> : post.status === 'pending_review' ? <p className={styles.muted}>운영자 검토가 끝나면 커뮤니티에 공개돼요.</p> : null}
      <details className={styles.preview}><summary>작성한 내용 보기</summary><p className={styles.body}>{post.body}</p></details>
      <div className={styles.actions}>
        {post.status === 'active' ? <Link className="btn-outline" href={`/community/${post.id}`}>게시글 보기</Link> : <Link className="btn-outline" href={`/community/${post.id}/edit`}>내용 수정</Link>}
        {post.status === 'rejected' ? <button className="btn-primary" type="button" disabled={busy !== null} onClick={() => void resubmit(post.id)}>{busy === post.id ? '검토 요청 중' : '다시 검토 요청'}</button> : null}
      </div>
    </article>)}</div>
  </div></MobileShell>;
}

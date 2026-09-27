'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { MobileShell } from '@/components/layout/MobileShell';
import { editPost, getPost, type CommunityPost } from '@/lib/community/client';
import { getGoSession } from '@/lib/go-auth/client';

export default function EditCommunityPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([getPost(id), getGoSession()]).then(([result, session]) => {
      if (!active) return;
      if (!result.ok) setError(result.message);
      else if (!session.ok || result.data.authorId !== session.session.member.id) setError('작성자만 수정할 수 있어요.');
      else { setPost(result.data); setTitle(result.data.title); setBody(result.data.body); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [id]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const result = await editPost(id, { title: title.trim(), body: body.trim() });
    if (result.ok) { setPost(result.data); setError(''); }
    else setError(result.message);
    setSaving(false);
  };
  return <MobileShell title="게시글 수정" showBack hideNav><div style={{ padding: 16 }}>
    {loading ? <p role="status">게시글을 불러오는 중이에요.</p> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {post ? <form onSubmit={(event) => void save(event)}>
      <p>{post.status === 'rejected' ? `반려 사유: ${post.reason ?? ''}` : post.status === 'pending_review' ? '검토 대기 중' : '공개된 게시글은 수정할 수 없어요.'}</p>
      <label htmlFor="edit-title">제목</label><input id="edit-title" className="form-input" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} disabled={post.status === 'active'} />
      <label htmlFor="edit-body">내용</label><textarea id="edit-body" className="form-textarea" value={body} maxLength={10000} onChange={(event) => setBody(event.target.value)} disabled={post.status === 'active'} rows={9} />
      {post.status !== 'active' ? <button className="btn-primary" type="submit" disabled={saving || title.trim().length < 4 || body.trim().length < 10}>{saving ? '저장 중' : '수정 저장'}</button> : null}
      <p><Link href="/my/posts">내 게시글 / 다시 검토 요청</Link></p>
    </form> : <Link href="/my/posts">내 게시글로</Link>}
  </div></MobileShell>;
}

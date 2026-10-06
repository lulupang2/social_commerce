'use client';

import { useTranslate } from '@/lib/i18n/use-translate';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { MobileShell } from '@/components/layout/MobileShell';
import { StatePanel } from '@/components/ui/StatePanel';
import styles from '../../community.module.css';
import { editPost, getPost, type CommunityPost } from '@/lib/community/client';
import { getGoSession } from '@/lib/go-auth/client';

export default function EditCommunityPostPage({ params }: { params: Promise<{ id: string }> }) {
  const translate = useTranslate();
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
      else if (!session.ok || result.data.authorId !== session.session.member.id) setError(translate('작성자만 수정할 수 있어요.'));
      else { setPost(result.data); setTitle(result.data.title); setBody(result.data.body); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [id, translate]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const result = await editPost(id, { title: title.trim(), body: body.trim() });
    if (result.ok) { setPost(result.data); setError(''); }
    else setError(result.message);
    setSaving(false);
  };
  return <MobileShell title={translate('게시글 수정')} showBack hideNav><div className={styles.content}>
    {loading ? <StatePanel role="status" description={translate('게시글을 불러오는 중이에요.')} /> : null}
    {error ? <StatePanel role="alert" title={post ? translate('수정 내용을 저장하지 못했어요') : translate('게시글을 열 수 없어요')} description={translate(error)} /> : null}
    {post ? <form className={styles.editor} onSubmit={(event) => void save(event)}>
      <div className={styles.notice}><strong>{post.status === 'rejected' ? translate('수정 후 다시 검토를 요청해 주세요') : post.status === 'pending_review' ? translate('운영자 검토 대기 중') : translate('공개된 게시글')}</strong><p>{post.status === 'rejected' ? `${translate('반려 사유')}: ${post.reason ?? translate('내용을 확인해 주세요.')}` : post.status === 'pending_review' ? translate('공개 전까지 내용을 수정할 수 있어요.') : translate('공개된 게시글은 수정할 수 없어요.')}</p></div>
      <div className="form-group"><label className="form-label" htmlFor="edit-title">{translate('제목')}</label><input id="edit-title" className="form-input" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} disabled={post.status === 'active'} aria-describedby="edit-title-hint" /><p className={styles.muted} id="edit-title-hint">{translate(`4자 이상 · ${title.length}/160자`)}</p></div>
      <div className="form-group"><label className="form-label" htmlFor="edit-body">{translate('내용')}</label><textarea id="edit-body" className="form-textarea" value={body} maxLength={10000} onChange={(event) => setBody(event.target.value)} disabled={post.status === 'active'} rows={9} aria-describedby="edit-body-hint" /><p className={styles.muted} id="edit-body-hint">{translate(`10자 이상 · ${body.length.toLocaleString()}/10,000자`)}</p></div>
      {post.status !== 'active' ? <button className="btn-primary" type="submit" disabled={saving || title.trim().length < 4 || body.trim().length < 10}>{saving ? translate('저장 중') : translate('수정 저장')}</button> : null}
      <Link className="btn-outline" href="/my/posts">{translate('내 게시글 · 검토 상태 확인')}</Link>
    </form> : !loading ? <Link className="btn-outline" href="/my/posts">{translate('내 게시글로')}</Link> : null}
  </div></MobileShell>;
}

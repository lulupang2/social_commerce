'use client';

import { useLocale } from 'next-intl';
import { useTranslate } from '@/lib/i18n/use-translate';

import { Flame, Heart, MessageSquare, Plus } from 'lucide-react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/display-format';
import { useState } from 'react';
import { StatePanel } from '@/components/ui/StatePanel';
import { MobileShell } from '@/components/layout/MobileShell';
import { changeLike } from '@/lib/community/client';
import { useCommunityPosts } from '@/lib/data/use-community-posts';
import styles from './community.module.css';

const labels = { guide: '스포츠 꿀팁', review: '장비 사용기', meetup: '세션 / 모임', discussion: '자유 수다 / Q&A' };
export default function CommunityPage() {
  const translate = useTranslate();
  const locale = useLocale();
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
  return <MobileShell title={translate('서핑 & 테니스 커뮤니티')}>
    <div className="sport-tabs community-tabs" role="group" aria-label={translate('커뮤니티 스포츠')}>
      {(['all', 'surf', 'tennis'] as const).map((value) => <button key={value} className={`sport-tab ${sport === value ? 'active' : ''}`} aria-pressed={sport === value} onClick={() => setSport(value)} type="button">{value === 'all' ? <><Flame size={16} />{translate('전체')}</> : value === 'surf' ? translate('서핑') : translate('테니스')}</button>)}
    </div>
    <Link className="community-create-fab" href="/community/create"><Plus size={18} />{translate('글쓰기')}</Link>
    <Link href="/my/posts" className="btn-outline" style={{ margin: 16 }}>{translate('내 게시글 / 검토 상태')}</Link>
    {loading ? <StatePanel role="status" description={translate('게시글을 불러오는 중이에요.')} /> : null}
    {error ? <StatePanel role="alert" description={translate(error)} actions={<button className="btn-outline" type="button" onClick={retry}>{translate('다시 시도')}</button>} /> : null}
    {actionError ? <StatePanel role="alert" description={translate(actionError)} /> : null}
    {!loading && !error && !posts.some((post) => sport === 'all' || post.sport === sport) ? <StatePanel title={translate('아직 공개된 게시글이 없어요')} description={sport === 'all' ? translate('첫 이야기를 나눠보세요. 작성한 글은 검토 후 공개돼요.') : translate('선택한 스포츠의 첫 이야기를 나눠보세요.')} actions={<Link className="btn-outline" href="/community/create">{translate('게시글 작성')}</Link>} /> : null}
    <div className={`community-feed ${styles.feed}`}>{!error && posts.filter((post) => sport === 'all' || post.sport === sport).map((post) => {
      const like = likes[post.id] ?? { count: post.likes, liked: post.liked };
      return <article className="community-card" key={post.id}>
        <header><div className="chat-avatar">{post.authorName.slice(0, 1)}</div><div><strong>{post.authorName}</strong><span>{formatDateTime(post.publishedAt ?? post.createdAt, locale)} · {translate(labels[post.type])}</span></div></header>
        <Link className="community-card-link" href={`/community/${post.id}`}><h2>{post.title}</h2><p>{post.body}</p></Link>
        <footer><button type="button" disabled={busy === post.id} aria-label={translate(`좋아요 ${like.count}개`) + (like.liked ? translate(', 취소') : "")} aria-pressed={like.liked} className={like.liked ? 'liked' : ''} onClick={() => void toggle(post.id, like.liked)}><Heart size={16} fill={like.liked ? 'currentColor' : 'none'} />{like.count}</button><Link href={`/community/${post.id}`} aria-label={translate(`댓글 ${post.comments}개 보기`)}><MessageSquare size={16} />{post.comments}</Link></footer>
      </article>;
    })}</div>
  </MobileShell>;
}

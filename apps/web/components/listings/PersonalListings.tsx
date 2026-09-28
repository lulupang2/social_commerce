'use client';

import Link from 'next/link';
import { CircleUserRound, PackageSearch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { WebListingCard } from '@/components/listings/WebListingCard';
import { MobileShell } from '@/components/layout/MobileShell';
import { StatePanel } from '@/components/ui/StatePanel';
import { AUTH_SESSION_EVENT, getGoSession } from '@/lib/go-auth/client';
import { toMarketListing, type GoListing } from '@/lib/go-listings/client';
import { listPersonalListings } from '@/lib/go-listings/personal';
import { resubmitListing, reviewHistory, type ReviewEvent } from '@/lib/go-listings/reviews';
import { useFavorites } from '@/lib/listings/use-favorites';
import { toMockListing } from '@/lib/listings/use-listings';

const STATUS_LABELS: Record<string, string> = {
  draft: '임시 저장', pending_review: '검토 대기', rejected: '반려', active: '공개 중',
  reserved: '예약 중', sold: '판매 완료', archived: '보관', removed: '삭제됨',
};

export function PersonalListings({ kind }: { kind: 'listings' | 'favorites' }) {
  const [items, setItems] = useState<GoListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const { favorites, updateFavorite, error: favoriteError } = useFavorites();
  useEffect(() => {
    const invalidate = () => { setItems([]); setError(''); setLoading(true); setRefresh((value) => value + 1); };
    window.addEventListener(AUTH_SESSION_EVENT, invalidate);
    window.addEventListener('focus', invalidate);
    return () => { window.removeEventListener(AUTH_SESSION_EVENT, invalidate); window.removeEventListener('focus', invalidate); };
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await getGoSession();
      if (!active) return;
      if (!session.ok) { setError(session.status === 401 ? '로그인이 필요합니다.' : session.message); setErrorStatus(session.status ?? 0); setLoading(false); return; }
      const result = await listPersonalListings(kind);
      if (!active) return;
      if (result.ok) { setItems(result.data); setError(''); }
      else { setError(result.message); setErrorStatus(result.status); }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [kind, refresh]);
  const title = kind === 'listings' ? '내 판매 내역' : '찜한 장비';
  return (
    <MobileShell title={title} showBack>
      <div className="account-page">
        <h1 className="account-page-title">{title}</h1>
        <nav className="account-page-links" aria-label="내 매물 탐색">
          <Link href="/profile">← 마이페이지</Link>
          {kind === 'listings' ? <Link href="/seller/apply">판매자 신청·상태 확인</Link> : null}
        </nav>
        {loading ? <StatePanel role="status" description="내 매물을 불러오고 있어요." /> : error ? (
          <StatePanel
            role="alert"
            icon={<CircleUserRound size={28} />}
            description={error}
            actions={errorStatus === 401 ? <Link className="btn-primary" href="/auth">로그인하기</Link> : errorStatus === 403 ? <Link href="/profile">마이페이지로</Link> : <button className="btn-outline" type="button" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>다시 시도</button>}
          />
        ) : items.length === 0 ? (
          <StatePanel
            icon={<PackageSearch size={28} />}
            title={`아직 ${kind === 'listings' ? '등록한 매물' : '찜한 공개 매물'}이 없어요.`}
            description={kind === 'listings' ? '사용하지 않는 장비를 새로운 주인에게 연결해 보세요.' : '마음에 드는 장비를 찜하고 여기서 모아보세요.'}
            actions={<Link className="btn-primary" href={kind === 'listings' ? '/sell' : '/market'}>{kind === 'listings' ? '장비 판매하기' : '마켓으로 가기'}</Link>}
          />
        ) : (
          <div className="product-grid">
            {items.map((item) => {
              const marketListing = toMarketListing(item);
              const listing = marketListing ? toMockListing(marketListing, 'go') : null;
              if (!listing) return null;
              return <div key={item.id}>
                {kind === 'listings' ? <p>{STATUS_LABELS[item.status]}</p> : null}
                {kind === 'listings' && item.status === 'active' ? <p><Link href={`/seller/inventory/${item.id}`}>판매 재고 설정</Link></p> : null}
                {kind === 'listings' && (item.status === 'rejected' || item.status === 'pending_review') ? <ReviewPanel item={item} onUpdated={() => setRefresh((value) => value + 1)} /> : null}
                <WebListingCard listing={listing} favorite={favorites[`go:${item.id}`] ?? false} onFavorite={async (id, favorite) => {
                  const saved = await updateFavorite(id, favorite);
                  if (saved && kind === 'favorites' && !favorite) setRefresh((value) => value + 1);
                }} />
              </div>;
            })}
          </div>
        )}
        {favoriteError ? <p className="form-error" role="alert">{favoriteError}</p> : null}
      </div>
    </MobileShell>
  );
}

function ReviewPanel({ item, onUpdated }: { item: GoListing; onUpdated: () => void }) {
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void reviewHistory(item.id).then((result) => {
      if (!active) return;
      if (result.ok) setEvents(result.data.items);
      else setError(result.message);
    });
    return () => { active = false; };
  }, [item.id]);
  const rejected = events.find((event) => event.toStatus === 'rejected');
  const resubmit = async () => {
    setBusy(true);
    const result = await resubmitListing(item.id);
    if (result.ok) onUpdated();
    else setError(result.message);
    setBusy(false);
  };
  return <div>
    {rejected?.reason ? <p role="status">반려 사유: {rejected.reason}</p> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {item.status === 'rejected' ? <>
      <Link href={`/market/${item.id}/edit`}>반려 매물 수정하기</Link>
      <button className="btn-outline" type="button" disabled={busy} onClick={() => void resubmit()}>다시 검토 요청</button>
    </> : null}
  </div>;
}

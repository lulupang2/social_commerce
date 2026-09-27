'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { WebListingCard } from '@/components/listings/WebListingCard';
import { MobileShell } from '@/components/layout/MobileShell';
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
      if (!session.ok) { setError(session.status === 401 ? '로그인이 필요합니다.' : session.message); setLoading(false); return; }
      const result = await listPersonalListings(kind);
      if (!active) return;
      if (result.ok) setItems(result.data);
      else setError(result.message);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [kind, refresh]);
  const title = kind === 'listings' ? '내 판매 내역' : '찜한 장비';
  return (
    <MobileShell title={title} showBack>
      <div style={{ padding: 16 }}>
        <Link href="/profile">← 마이페이지</Link>
        <h1 style={{ fontSize: '1.2rem', margin: '16px 0' }}>{title}</h1>
        {kind === 'listings' ? <p><Link href="/seller/apply">판매자 신청·상태 확인</Link></p> : null}
        {loading ? <p role="status">내 매물을 불러오고 있어요.</p> : error ? (
          <div role="alert"><p>{error}</p><button className="btn-outline" type="button" onClick={() => setRefresh((value) => value + 1)}>다시 시도</button><Link href="/auth">로그인하기</Link></div>
        ) : items.length === 0 ? <p>아직 {kind === 'listings' ? '등록한 매물' : '찜한 공개 매물'}이 없어요.</p> : (
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

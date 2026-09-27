'use client';

import { useCallback, useEffect, useState } from 'react';
import { MobileShell } from '@/components/layout/MobileShell';
import { getSellerStatus, listSellerApplications, reviewSellerApplication } from '@/lib/go-listings/seller';
import type { SellerApplication } from '@icegear/domain';

export default function SellerReviewPage() {
  const [authorized, setAuthorized] = useState(false);
  const [items, setItems] = useState<SellerApplication[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const reload = useCallback(async () => {
    const role = await getSellerStatus();
    if (!role.ok) { setError(role.message); setLoading(false); return; }
    if (!role.data.reviewer) { setAuthorized(false); setError('운영자 권한이 필요합니다.'); setLoading(false); return; }
    setAuthorized(true);
    const result = await listSellerApplications();
    if (result.ok) { setItems(result.data.items); setError(''); }
    else setError(result.message);
    setLoading(false);
  }, []);
  useEffect(() => { queueMicrotask(() => { void reload(); }); }, [reload]);
  const review = async (item: SellerApplication, decision: 'approve' | 'reject') => {
    setBusy(item.id);
    const result = await reviewSellerApplication(item.id, decision, reasons[item.id]?.trim() ?? '');
    if (result.ok) setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    else { setError(result.message); await reload(); }
    setBusy(null);
  };
  return <MobileShell title="판매자 신청 검토">
    <main className="container" style={{ padding: 16 }}>
      {loading ? <p role="status">신청 목록을 불러오고 있어요.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {authorized && !loading && items.length === 0 ? <p>검토 대기 중인 신청이 없습니다.</p> : null}
      {authorized && items.map((item) => <article key={item.id} className="checkout-card">
        <h2>{item.displayName}</h2><p>{item.type === 'business' ? '사업자' : '개인'} · 신청일 {new Date(item.createdAt).toLocaleDateString('ko-KR')}</p>
        <label>반려 사유 <input maxLength={1000} value={reasons[item.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
        <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void review(item, 'approve')}>승인</button>
        <button type="button" className="btn-outline" disabled={busy !== null || !reasons[item.id]?.trim()} onClick={() => void review(item, 'reject')}>반려</button>
      </article>)}
    </main>
  </MobileShell>;
}

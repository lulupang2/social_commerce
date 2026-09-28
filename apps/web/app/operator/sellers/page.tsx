'use client';

import Link from 'next/link';

import { useCallback, useEffect, useState } from 'react';
import { StatePanel } from '@/components/ui/StatePanel';
import { MobileShell } from '@/components/layout/MobileShell';
import { getSellerStatus, listSellerApplications, reviewSellerApplication } from '@/lib/go-listings/seller';
import type { SellerApplication } from '@icegear/domain';

export default function SellerReviewPage() {
  const [authorized, setAuthorized] = useState(false);
  const [items, setItems] = useState<SellerApplication[]>([]);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const reload = useCallback(async () => {
    const role = await getSellerStatus();
    if (!role.ok) { setError(role.message); setErrorStatus(role.status); setLoading(false); return; }
    if (!role.data.reviewer) { setAuthorized(false); setError('운영자 권한이 필요합니다.'); setErrorStatus(403); setLoading(false); return; }
    setAuthorized(true);
    const result = await listSellerApplications();
    if (result.ok) { setItems(result.data.items); setError(''); }
    else { setError(result.message); setErrorStatus(result.status); }
    setLoading(false);
  }, []);
  useEffect(() => { queueMicrotask(() => { void reload(); }); }, [reload]);
  const review = async (item: SellerApplication, decision: 'approve' | 'reject') => {
    setBusy(item.id);
    const result = await reviewSellerApplication(item.id, decision, reasons[item.id]?.trim() ?? '');
    if (result.ok) setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    else { setError(result.message); setErrorStatus(result.status); await reload(); }
    setBusy(null);
  };
  return <MobileShell title="판매자 신청 검토">
    <div className="container" style={{ padding: 16 }}>
      {loading ? <StatePanel role="status" description="신청 목록을 불러오고 있어요." /> : null}
      {!loading && error ? <StatePanel role="alert" description={error} actions={errorStatus === 401 ? <Link className="btn-primary" href="/auth">로그인하기</Link> : errorStatus === 403 || errorStatus === 404 ? <Link href="/profile">마이페이지로</Link> : <button type="button" className="btn-outline" disabled={busy !== null} onClick={() => { setLoading(true); void reload(); }}>다시 시도</button>} /> : null}
      {authorized && !loading && !error && items.length === 0 ? <StatePanel description="검토 대기 중인 신청이 없습니다." /> : null}
      {authorized && items.map((item) => <article key={item.id} className="checkout-card">
        <h2>{item.displayName}</h2><p>{item.type === 'business' ? '사업자' : '개인'} · 신청일 {new Date(item.createdAt).toLocaleDateString('ko-KR')}</p>
        <label>반려 사유 <input maxLength={1000} value={reasons[item.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
        <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void review(item, 'approve')}>승인</button>
        <button type="button" className="btn-outline" disabled={busy !== null || !reasons[item.id]?.trim()} onClick={() => void review(item, 'reject')}>반려</button>
      </article>)}
    </div>
  </MobileShell>;
}

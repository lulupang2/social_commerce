'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import { applyForSeller, getSellerStatus } from '@/lib/go-listings/seller';
import type { SellerStatus } from '@icegear/domain';

export default function SellerApplyPage() {
  const [status, setStatus] = useState<SellerStatus | null>(null);
  const [type, setType] = useState<'individual' | 'business'>('individual');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    const result = await getSellerStatus();
    if (result.ok) { setStatus(result.data); setError(''); }
    else setError(result.message);
    setLoading(false);
  }, []);
  useEffect(() => { queueMicrotask(() => { void reload(); }); }, [reload]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    const result = await applyForSeller(type, displayName.trim());
    if (result.ok) await reload();
    else setError(result.message);
    setBusy(false);
  };
  return <MobileShell title="판매자 신청">
    <main className="container" style={{ padding: 16 }}>
      {loading ? <p role="status">판매자 상태를 확인하고 있어요.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {status?.seller ? <section><h2>판매자 승인 완료</h2><p>{status.seller.displayName}</p>
        <Link href="/my/listings">내 매물과 재고 관리</Link> · <Link href="/seller/orders">판매 주문 처리</Link></section> : null}
      {!status?.seller && status?.application?.status === 'pending' ?
        <p>판매자 신청을 검토 중입니다. 승인 전에는 판매 재고를 등록할 수 없어요.</p> : null}
      {!status?.seller && status?.application?.status === 'rejected' ?
        <p role="status">이전 신청이 반려되었습니다: {status.application.reason}</p> : null}
      {status && !status.seller && status.application?.status !== 'pending' ? <form onSubmit={(event) => void submit(event)}>
        <p>신청 후 운영자의 승인이 필요합니다. 실제 사업자 인증은 제공하지 않습니다.</p>
        <label>판매 유형 <select value={type} onChange={(event) => setType(event.target.value as 'individual' | 'business')}>
          <option value="individual">개인</option><option value="business">사업자</option>
        </select></label>
        <label>표시 이름 <input required maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <button type="submit" className="btn-primary" disabled={busy || !displayName.trim()}>{busy ? '신청 중…' : '승인 신청'}</button>
      </form> : null}
    </main>
  </MobileShell>;
}

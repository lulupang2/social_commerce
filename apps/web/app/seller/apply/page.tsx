'use client';

import { useTranslate } from '@/lib/i18n/use-translate';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { StatePanel } from '@/components/ui/StatePanel';
import { MobileShell } from '@/components/layout/MobileShell';
import { applyForSeller, getSellerStatus } from '@/lib/go-listings/seller';
import type { SellerStatus } from '@icegear/domain';
import styles from '@/components/seller/management.module.css';

export default function SellerApplyPage() {
  const translate = useTranslate();
  const [status, setStatus] = useState<SellerStatus | null>(null);
  const [type, setType] = useState<'individual' | 'business'>('individual');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    const result = await getSellerStatus();
    if (result.ok) { setStatus(result.data); setError(''); }
    else { setError(result.message); setErrorStatus(result.status); }
    setLoading(false);
  }, []);
  useEffect(() => { queueMicrotask(() => { void reload(); }); }, [reload]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    const result = await applyForSeller(type, displayName.trim());
    if (result.ok) await reload();
    else { setError(result.message); setErrorStatus(result.status); }
    setBusy(false);
  };
  return <MobileShell title={translate("판매자 신청")}>
    <div className={`container ${styles.page}`}>
      {loading ? <StatePanel role="status" description={translate("판매자 상태를 확인하고 있어요.")} /> : null}
      {!loading && error ? <StatePanel role="alert" description={translate(error)} actions={errorStatus === 401 ? <Link className="btn-primary" href="/auth">{translate("로그인하기")}</Link> : errorStatus === 403 || errorStatus === 404 ? <Link className="btn-outline" href="/profile">{translate("마이페이지로")}</Link> : <button type="button" className="btn-outline" disabled={busy} onClick={() => { setLoading(true); void reload(); }}>{translate("다시 시도")}</button>} /> : null}
      {status?.seller ? <section className={styles.card}>
        <div className={styles.heading}><h2>{translate("판매자 승인 완료")}</h2><p className={styles.description}>{status.seller.displayName}</p></div>
        <div className={styles.actions}><Link className="btn-primary" href="/my/listings">{translate("내 매물과 재고 관리")}</Link><Link className="btn-outline" href="/seller/orders">{translate("판매 주문 처리")}</Link></div>
      </section> : null}
      {!status?.seller && status?.application?.status === 'pending' ?
        <StatePanel role="status" title={translate("판매자 신청 검토 중")} description={translate("승인 전에는 판매 재고를 등록할 수 없어요. 검토가 끝나면 이 화면에서 결과를 확인할 수 있습니다.")} actions={<Link className="btn-outline" href="/profile">{translate("마이페이지로")}</Link>} /> : null}
      {!status?.seller && status?.application?.status === 'rejected' ?
        <StatePanel role="status" title={translate("이전 신청이 반려되었어요")} description={((status.application.reason || translate('반려 사유가 없습니다.')) + translate("\n아래 신청 정보를 확인한 뒤 다시 신청할 수 있어요."))} /> : null}
      {status && !status.seller && status.application?.status !== 'pending' ? <form className={styles.card} aria-busy={busy} onSubmit={(event) => void submit(event)}>
        <div className={styles.heading}><h2>{translate("판매자 정보")}</h2><p className={styles.description}>{translate("신청 후 운영자의 승인이 필요합니다. 실제 사업자 인증은 제공하지 않습니다.")}</p></div>
        <div className={styles.field}>
          <label className="form-label" htmlFor="seller-type">{translate("판매 유형")}</label>
          <select id="seller-type" className="form-select" value={type} onChange={(event) => setType(event.target.value as 'individual' | 'business')}>
            <option value="individual">{translate("개인")}</option><option value="business">{translate("사업자")}</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className="form-label" htmlFor="seller-display-name">{translate("표시 이름")}</label>
          <input id="seller-display-name" className="form-input" required maxLength={120} aria-describedby="seller-name-help" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <p id="seller-name-help" className={styles.description}>{translate("판매자로 표시할 이름을 120자 이내로 입력해 주세요.")}</p>
        </div>
        <div className={styles.actions}><button type="submit" className="btn-primary" disabled={busy || !displayName.trim()}>{busy ? translate('신청 중…') : translate('승인 신청')}</button></div>
      </form> : null}
    </div>
  </MobileShell>;
}

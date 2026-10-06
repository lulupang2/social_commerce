'use client';

import { useTranslate } from '@/lib/i18n/use-translate';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { StatePanel } from '@/components/ui/StatePanel';
import { MobileShell } from '@/components/layout/MobileShell';
import { getOwnerInventory, setOwnerInventory } from '@/lib/go-listings/seller';
import type { InventoryView } from '@icegear/domain';
import styles from '@/components/seller/management.module.css';

export default function SellerInventoryPage() {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const [stock, setStock] = useState<InventoryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);
  const reload = useCallback(async () => {
    const result = await getOwnerInventory(id);
    if (result.ok) { setStock(result.data.inventory); setError(''); }
    else { setError(result.message); setErrorStatus(result.status); }
    setLoading(false);
  }, [id]);
  useEffect(() => { queueMicrotask(() => { void reload(); }); }, [reload]);
  const setAvailability = async (available: 0 | 1) => {
    setBusy(true);
    const result = await setOwnerInventory(id, available);
    if (result.ok) { setStock(result.data); setError(''); }
    else { setError(result.message); setErrorStatus(result.status); await reload(); }
    setBusy(false);
  };
  return <MobileShell title={translate("판매 재고 설정")}>
    <div className={`container ${styles.page}`}>
      <Link className={styles.backLink} href="/my/listings">{translate("← 내 매물로 돌아가기")}</Link>
      <p className={styles.description}>{translate("판매자 승인과 매물 공개 검토를 모두 마친 뒤 재고 1개를 등록하면 주문할 수 있습니다.")}</p>
      {loading ? <StatePanel role="status" description={translate("재고를 확인하고 있어요.")} /> : null}
      {!loading && error ? <StatePanel role="alert" description={translate(error)} actions={errorStatus === 401 ? <Link className="btn-primary" href="/auth">{translate("로그인하기")}</Link> : errorStatus === 403 || errorStatus === 404 ? <Link className="btn-outline" href="/profile">{translate("마이페이지로")}</Link> : <button type="button" className="btn-outline" disabled={busy} onClick={() => { setLoading(true); void reload(); }}>{translate("다시 시도")}</button>} /> : null}
      {!loading ? <section className={styles.card} aria-busy={busy}>
        <div className={styles.heading}><h2>{translate("현재 재고")}</h2></div>
        <dl className={styles.facts}>
          <div><dt>{translate("판매 가능")}</dt><dd>{translate(`${stock?.availableQuantity ?? 0}개`)}</dd></div>
          <div><dt>{translate("예약 중")}</dt><dd>{translate(`${stock?.reservedQuantity ?? 0}개`)}</dd></div>
        </dl>
        <div className={styles.actions}>
          <button type="button" className="btn-primary" disabled={busy || stock?.availableQuantity === 1} onClick={() => void setAvailability(1)}>{translate("재고 1개 판매 시작")}</button>
          <button type="button" className="btn-outline" disabled={busy || !stock || stock.availableQuantity === 0} onClick={() => void setAvailability(0)}>{translate("판매 중지")}</button>
        </div>
        {busy ? <p className={styles.description} role="status">{translate("재고를 변경하고 있어요.")}</p> : null}
        <p className={styles.description}>{translate("예약·판매 완료 물품은 재고로 다시 등록할 수 없습니다.")}</p>
      </section> : null}
    </div>
  </MobileShell>;
}

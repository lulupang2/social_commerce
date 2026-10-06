'use client';

import { useLocale } from 'next-intl';
import { useTranslate } from '@/lib/i18n/use-translate';

import { ArrowLeft, Clock3, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { formatWon } from '@/lib/display-format';
import { useRouter } from 'next/navigation';
import { use, useEffect, useRef, useState } from 'react';
import { getEditableGoListing, type GoListing } from '@/lib/go-listings/client';
import { createOrder } from '@/lib/go-listings/orders';
import { listingAvailability } from '@/lib/go-listings/reviews';

export default function NewOrderPage({ params }: { params: Promise<{ listingId: string }> }) {
  const locale = useLocale();
  const translate = useTranslate();
  const { listingId } = use(params);
  const router = useRouter();
  const [listing, setListing] = useState<GoListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void Promise.all([getEditableGoListing(listingId), listingAvailability(listingId)]).then(([item, availability]) => {
      if (!active) return;
      if (!item || item.status !== 'active') setError(translate('구매 가능한 서버 상품을 찾을 수 없어요.'));
      else if (!availability.ok) setError(availability.message);
      else if (!availability.data.purchasable) setError(availability.data.reason === 'sold_out' ? translate('재고가 없어요.') : translate('판매 준비 중이에요.'));
      else setListing(item);
      setLoading(false);
    });
    return () => { active = false; };
  }, [listingId, translate]);
  async function submit() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    const result = await createOrder({ listingId, quantity: 1 });
    if (result.ok) { router.push(`/order/confirm/${result.data.id}`); return; }
    setError(result.message); setBusy(false); pending.current = false;
  }
  return (
    <main className="checkout-page">
      <div className="checkout-shell order-form-shell">
        <Link className="order-back-link" href={`/market/${listingId}`}>
          <ArrowLeft aria-hidden="true" size={17} />{translate("상품으로 돌아가기")}</Link>

        <header className="checkout-header order-form-header">
          <h1>{translate("주문서")}</h1>
          <p>{translate("상품과 결제 금액을 확인한 뒤 안전하게 주문을 진행해 주세요.")}</p>
        </header>

        {loading ? (
          <div aria-live="polite" className="order-loading-card" role="status">
            <span className="order-loading-line order-loading-title" />
            <span className="order-loading-line" />
            <span className="order-loading-line order-loading-short" />
            <span className="visually-hidden">{translate("상품을 불러오는 중...")}</span>
          </div>
        ) : null}

        {error ? <p className="checkout-alert" role="alert">{translate(error)}</p> : null}

        {listing ? (
          <section aria-live="polite" className="checkout-card order-form-card">
            <div className="order-product-summary">
              <span>{translate("구매 상품")}</span>
              <h2>{listing.title}</h2>
            </div>

            <div className="order-price-row">
              <span>{translate("상품 금액")}</span>
              <strong>{formatWon(listing.priceKrw, locale)}</strong>
            </div>

            <div className="order-quantity-field">
              <div>
                <label htmlFor="order-quantity">{translate("수량")}</label>
                <p>{translate("현재 한 번에 1개 상품을 주문할 수 있어요.")}</p>
              </div>
              <select disabled id="order-quantity" value="1">
                <option value="1">{translate("1개")}</option>
              </select>
            </div>

            <div className="checkout-total order-form-total">
              <span>{translate("총 결제 금액")}</span>
              <strong>{formatWon(listing.priceKrw, locale)}</strong>
            </div>

            <div className="order-reservation-note">
              <Clock3 aria-hidden="true" size={18} />
              <div>
                <strong>{translate("15분 동안 상품을 예약해요")}</strong>
                <p>{translate("서버에서 가격과 재고를 다시 확인하며 배송비와 수수료는 없습니다.")}</p>
              </div>
            </div>

            <button
              className="checkout-button checkout-button-primary order-submit-button"
              disabled={busy}
              onClick={() => void submit()}
              type="button"
            >
              {busy ? translate('주문 확인 중...') : translate('주문 확인하고 결제 단계로')}
            </button>
          </section>
        ) : null}

        <Link className="order-history-link" href="/orders">
          <ReceiptText aria-hidden="true" size={17} />{translate("내 주문 내역 확인")}</Link>
      </div>
    </main>
  );
}

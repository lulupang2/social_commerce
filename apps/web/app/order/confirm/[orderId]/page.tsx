'use client';

import { useLocale } from 'next-intl';
import { useTranslate } from '@/lib/i18n/use-translate';

import Link from 'next/link';
import { formatWon } from '@/lib/display-format';
import Script from 'next/script';
import { use, useEffect, useRef, useState } from 'react';
import { confirmPayment, getOrder, getPaymentConfig, refundOrder, type Order } from '@/lib/go-listings/orders';

type Widgets = {
  setAmount(amount: {currency: 'KRW'; value: number}): Promise<void>;
  renderPaymentMethods(options: {selector: string; variantKey: string}): Promise<unknown>;
  renderAgreement(options: {selector: string; variantKey: string}): Promise<unknown>;
  requestPayment(options: {orderId: string; orderName: string; successUrl: string; failUrl: string; windowTarget: 'self'}): Promise<void>;
};
declare global { interface Window { TossPayments?: (key: string) => {widgets(options: {customerKey: string}): Widgets}; } }

export default function ConfirmOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const locale = useLocale();
  const translate = useTranslate();
  const { orderId } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [config, setConfig] = useState<{provider: 'toss_test'|'fake_toss'; clientKey: string; customerKey: string}|null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);
  const widgets = useRef<Widgets | null>(null);
  const pending = useRef(false);
  const callbackHandled = useRef(false);
  useEffect(() => {
    let active = true;
    void getPaymentConfig(orderId).then(r => { if(active) {if(r.ok)setConfig(r.data);else setError(r.message);} });
    const query = new URLSearchParams(window.location.search);
    async function refresh() {
      const result = await getOrder(orderId);
      if (!active) return;
      if (!result.ok) {setError(result.message);return;}
      if(query.has('code')) setError(translate('토스 결제가 완료되지 않았습니다. 주문 상태를 확인한 후 다시 시도하세요.'));
      setOrder(result.data);
      if(query.has('paymentKey') && !callbackHandled.current) {
        callbackHandled.current = true;
        const amount = Number(query.get('amount'));
        if(query.get('orderId') !== orderId || !Number.isSafeInteger(amount) || amount !== result.data.totalAmountKrw) {
          setError(translate('결제 정보가 서버 주문과 일치하지 않습니다.'));return;
        }
        pending.current = true;setBusy(true);
        const approved = await confirmPayment(result.data, {paymentKey:query.get('paymentKey')!,amount});
        if(active) {
          if(approved.ok) {setOrder(approved.data);window.history.replaceState(null,'',window.location.pathname);}
          else setError(approved.message);
          setBusy(false);
        }
        pending.current = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(),5000);
    return () => {active=false;clearInterval(timer);};
  },[orderId, translate]);
  async function prepare() {
    if(!order || !config || !sdkReady || !window.TossPayments || pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try {
      const instance=window.TossPayments(config.clientKey).widgets({customerKey:config.customerKey});
      widgets.current=instance;
      await instance.setAmount({currency:'KRW',value:order.totalAmountKrw});
      await instance.renderPaymentMethods({selector:'#payment-methods',variantKey:'DEFAULT'});
      await instance.renderAgreement({selector:'#payment-agreement',variantKey:'AGREEMENT'});
      setWidgetReady(true);
    } catch {setError(translate('토스 결제 화면을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'));}
    finally {pending.current=false;setBusy(false);}
  }
  async function pay() {
    if(!order || !config || pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try {
      if(config.provider==='fake_toss') {
        const result=await confirmPayment(order);if(result.ok)setOrder(result.data);else setError(result.message);
      } else if(widgets.current) {
        const url=window.location.origin+window.location.pathname;
        await widgets.current.requestPayment({orderId:order.id,orderName:order.itemName.slice(0,100),successUrl:url,failUrl:url,windowTarget:'self'});
      }
    } catch {setError(translate('결제가 완료되지 않았습니다. 주문 상태를 확인한 후 다시 시도하세요.'));}
    finally {pending.current=false;setBusy(false);}
  }
  async function refund() {
    if(!order || pending.current)return;
    pending.current=true;setBusy(true);setError('');
    const result=await refundOrder(order.id);
    if(result.ok)setOrder(result.data);else setError(result.message);
    pending.current=false;setBusy(false);
  }
  const canPay=order?.status==='pending' && order.paymentStatus==='unpaid';
  const providerLabel = config?.provider === 'toss_test' ? 'TOSS PAYMENTS · TEST' : config?.provider === 'fake_toss' ? 'FIXTURE PAYMENT' : 'PAYMENT SETUP';
  const introduction = config?.provider==='toss_test'
    ? translate('토스페이먼츠 테스트 모드입니다. 실제 과금·배송·판매자 지급은 없습니다.')
    : config?.provider==='fake_toss'
      ? translate('키 없는 fixture 결제 검증입니다. 실제 토스 결제가 아닙니다.')
      : translate('결제 환경을 확인하고 있습니다.');
  return <main className="checkout-page">
    {config?.provider==='toss_test' && <Script src="https://js.tosspayments.com/v2/standard" onReady={()=>setSdkReady(true)} onError={()=>setError(translate('토스 SDK를 불러오지 못했습니다.'))} />}
    <div className="checkout-shell">
      <header className="checkout-header">
        <span className="checkout-kicker">{providerLabel}</span>
        <h1>{translate("테스트 결제")}</h1>
        <p>{introduction}</p>
        <p className="checkout-session-note">{translate("테스트 로그인은 브라우저 세션마다 분리됩니다. 로그아웃하거나 쿠키를 지우면 이전 주문에 다시 접근할 수 없습니다.")}</p>
      </header>
      {error && <p className="checkout-alert" role="alert">{translate(error)}</p>}
      {order && <section className="checkout-card" aria-live="polite">
        <div className="checkout-order-summary">
          <span>{translate("주문 상품")}</span>
          <h2>{order.itemName}</h2>
          <p>{translate("수량 1개")}</p>
        </div>
        <div className="checkout-total"><span>{translate("총 결제 금액")}</span><strong>{formatWon(order.totalAmountKrw, locale)}</strong></div>
        {order.paymentStatus==='approved' && <div className="checkout-state checkout-state-success"><strong>{translate("테스트 결제 승인을 확인했습니다.")}</strong><span>{config?.provider==='toss_test' ? translate('토스 테스트 결제 내역과 서버 주문이 일치합니다.') : config?.provider==='fake_toss' ? translate('격리 fixture 결제 승인입니다. 실제 토스 결제가 아닙니다.') : translate('서버에서 승인된 테스트 주문입니다.')}</span></div>}
        {order.paymentStatus==='pending_approval' && <p className="checkout-state" role="status">{translate("결제 결과를 확인하고 있습니다. 승인 전까지 완료로 표시하지 않습니다.")}</p>}
        {order.paymentStatus==='pending_cancel' && <p className="checkout-state" role="status">{translate("전체 취소 결과를 확인하고 있습니다. 완료 전까지 재고를 복원하지 않습니다.")}</p>}
        {order.paymentStatus==='cancelled' && <p className="checkout-state checkout-state-success">{translate("결제 전체 취소가 확인되었습니다.")}</p>}
        {order.status==='cancelled' && order.paymentStatus!=='cancelled' && <p className="checkout-state">{translate("주문이 취소되거나 만료되었습니다.")}</p>}
        {order.paymentStatus==='approved' && (order.fulfillmentStatus==='awaiting_acceptance'||order.fulfillmentStatus==='accepted') && <button className="checkout-button checkout-button-danger" disabled={busy} onClick={()=>void refund()}>{translate("테스트 결제 전체 취소")}</button>}
        {canPay && config?.provider==='toss_test' && !widgetReady && <button className="checkout-button checkout-button-primary" disabled={busy||!sdkReady} onClick={()=>void prepare()}>{translate("토스 테스트 결제 준비")}</button>}
        <div className="checkout-widget" hidden={!canPay}><div id="payment-methods"/><div id="payment-agreement"/></div>
        {canPay && (widgetReady||config?.provider==='fake_toss') && <button className="checkout-button checkout-button-primary" disabled={busy} onClick={()=>void pay()}>{busy?translate('처리 중…'):config?.provider==='fake_toss'?translate('가짜 PG 승인'):(formatWon(order.totalAmountKrw, locale) + translate(" 테스트 결제"))}</button>}
      </section>}
      <nav className="checkout-links" aria-label={translate("주문 탐색")}><Link href={`/order/${orderId}`}>{translate("주문 상세")}</Link><span>·</span><Link href="/orders">{translate("내 주문 내역")}</Link></nav>
      <nav className="checkout-links" aria-label={translate("마켓 복귀")}><Link href="/market">{translate("마켓으로 가기")}</Link></nav>
    </div>
  </main>;
}

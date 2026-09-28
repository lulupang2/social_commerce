'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { StatePanel } from '@/components/ui/StatePanel';
import { OrderPaymentBadge, OrderFulfillmentStatus } from '@/components/orders/OrderStatus';
import { formatWon } from '@/lib/display-format';
import { MobileShell } from '@/components/layout/MobileShell';
import { acceptSellerOrder, handOverSellerOrder, listSellerOrders, type Order } from '@/lib/go-listings/orders';



export default function SellerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const reload = async () => {
      const result = await listSellerOrders();
      if (!active) return;
      if (result.ok) { setOrders(result.data.orders); setError(''); }
      else { setError(result.message); setErrorStatus(result.status); }
      setLoading(false);
    };
    void reload();
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; document.removeEventListener('visibilitychange', onVisible); };
  }, [generation]);

  const advance = async (order: Order, action: 'accept' | 'hand-over') => {
    setBusy(order.id);
    const result = action === 'accept' ? await acceptSellerOrder(order.id) : await handOverSellerOrder(order.id);
    if (result.ok) {
      setOrders((current) => current.map((item) => item.id === order.id ? result.data : item));
      setError('');
    } else { setError(result.message); setErrorStatus(result.status); }
    setBusy(null);
  };

  return <MobileShell title="판매 주문 처리">
    <div className="container" style={{ padding: 16 }}>
      <p>결제 승인과 물품 전달·수령은 별개입니다. 실제 배송사 연동과 정산은 진행하지 않습니다.</p>
      {loading ? <StatePanel role="status" description="판매 주문을 불러오고 있어요." /> : null}
      {!loading && error ? <StatePanel role="alert" description={error} actions={errorStatus === 401 ? <Link href="/auth" className="btn-primary">로그인하기</Link> : errorStatus === 403 ? <Link href="/profile">마이페이지로</Link> : <button type="button" className="btn-outline" onClick={() => { setLoading(true); setGeneration((value) => value + 1); }}>다시 시도</button>} /> : null}
      {!loading && !error && orders.length === 0 ? <StatePanel description="처리할 판매 주문이 없습니다." /> : null}
      <div className="order-list">
        {orders.map((order) => <article className="checkout-card" key={order.id}>
          <h2>{order.itemName}</h2>
          <OrderPaymentBadge order={order} />
          <OrderFulfillmentStatus order={order} audience="seller" />
          <p>{formatWon(order.totalAmountKrw)} · 수량 {order.quantity}</p>
          <Link href={`/order/${order.id}`}>주문 상세</Link>
          {order.status === 'confirmed' && order.paymentStatus === 'approved' && order.fulfillmentStatus === 'awaiting_acceptance' ?
            <button type="button" className="btn-primary" disabled={busy === order.id} onClick={() => void advance(order, 'accept')}>판매자 접수</button> : null}
          {order.status === 'confirmed' && order.paymentStatus === 'approved' && order.fulfillmentStatus === 'accepted' ?
            <button type="button" className="btn-primary" disabled={busy === order.id} onClick={() => void advance(order, 'hand-over')}>전달/발송 처리</button> : null}
        </article>)}
      </div>
    </div>
  </MobileShell>;
}

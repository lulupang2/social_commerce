'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import { acceptSellerOrder, handOverSellerOrder, listSellerOrders, type Order } from '@/lib/go-listings/orders';

const fulfillmentText: Record<Order['fulfillmentStatus'], string> = {
  awaiting_acceptance: '판매자 접수 대기',
  accepted: '접수 완료 · 전달 대기',
  handed_over: '전달 완료 · 구매자 수령 대기',
  completed: '구매자 수령 확인 · 거래 완료',
};

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const reload = async () => {
      const result = await listSellerOrders();
      if (!active) return;
      if (result.ok) { setOrders(result.data.orders); setError(''); }
      else setError(result.message);
      setLoading(false);
    };
    void reload();
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const advance = async (order: Order, action: 'accept' | 'hand-over') => {
    setBusy(order.id);
    const result = action === 'accept' ? await acceptSellerOrder(order.id) : await handOverSellerOrder(order.id);
    if (result.ok) {
      setOrders((current) => current.map((item) => item.id === order.id ? result.data : item));
      setError('');
    } else setError(result.message);
    setBusy(null);
  };

  return <MobileShell title="판매 주문 처리">
    <div className="container" style={{ padding: 16 }}>
      <p>결제 승인과 물품 전달·수령은 별개입니다. 실제 배송사 연동과 정산은 진행하지 않습니다.</p>
      {loading ? <p role="status">판매 주문을 불러오고 있어요.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {!loading && !error && orders.length === 0 ? <p>처리할 판매 주문이 없습니다.</p> : null}
      <div className="order-list">
        {orders.map((order) => <article className="checkout-card" key={order.id}>
          <h2>{order.itemName}</h2>
          <p>결제: {order.paymentStatus === 'approved' ? '승인' : order.paymentStatus === 'cancelled' ? '취소' : '확인 중 / 미결제'}</p>
          <p>전달: {order.status === 'cancelled' ? '주문 취소' : fulfillmentText[order.fulfillmentStatus]}</p>
          <p>{order.totalAmountKrw.toLocaleString()}원 · 수량 {order.quantity}</p>
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

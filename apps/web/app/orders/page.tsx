'use client';

import Link from 'next/link';
import { ShoppingBag, CircleUserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MobileShell } from '@/components/layout/MobileShell';
import { StatePanel } from '@/components/ui/StatePanel';

import { listOrders, type Order } from '@/lib/go-listings/orders';
import { getGoSession } from '@/lib/go-auth/client';

import { OrderPaymentBadge } from '@/components/orders/OrderStatus';
import { formatKrw, formatRelativeTime } from '@/lib/display-format';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let active = true;
    void getGoSession().then((sessionResult) => {
      if (!active) return;
      if (!sessionResult.ok) {
        setError(sessionResult.status === 401 ? '로그인이 필요합니다.' : sessionResult.message);
        setErrorStatus(sessionResult.status ?? 0);
        setLoading(false);
        return;
      }
      void listOrders().then((result) => {
        if (!active) return;
        if (result.ok) {
          setOrders(result.data.orders);
          setError('');
        } else {
          setError(result.message ?? '주문 목록을 불러올 수 없습니다.');
          setErrorStatus(result.status);
        }
        setLoading(false);
      });
    });
    return () => { active = false; };
  }, [generation]);

  return (
    <MobileShell title="내 주문 내역" showBack>
      <div className="account-page">
        <h1 className="account-page-title">내 주문 내역</h1>
        <nav aria-label="주문 탐색" className="account-page-links">
          <Link href="/profile">← 마이페이지</Link>
          <Link href="/market">마켓으로 가기</Link>
        </nav>

        {loading ? (
          <StatePanel role="status" description="주문 내역을 불러오고 있어요." />
        ) : error ? (
          <StatePanel
            role="alert"
            icon={<CircleUserRound size={28} />}
            description={error}
            actions={errorStatus === 401 ? <Link href="/auth" className="btn-primary">로그인하기</Link> :
              errorStatus === 403 ? <Link href="/profile">마이페이지로</Link> :
              <button type="button" className="btn-outline" onClick={() => { setLoading(true); setGeneration((value) => value + 1); }}>다시 시도</button>}
          />
        ) : orders.length === 0 ? (
          <StatePanel
            icon={<ShoppingBag size={28} />}
            title="아직 주문 내역이 없습니다."
            description="마켓에서 나에게 맞는 장비를 찾아보세요."
            actions={<Link href="/market" className="btn-primary">마켓으로 가기</Link>}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <Link href={`/order/${order.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '16px',
        transition: 'box-shadow 0.2s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <strong>{order.itemName}</strong>
          <OrderPaymentBadge order={order} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-muted)' }}>
          <span>{formatKrw(order.totalAmountKrw)}</span>
          <span>{formatRelativeTime(order.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

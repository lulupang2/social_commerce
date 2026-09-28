'use client';

import Link from 'next/link';
import { ShoppingBag, CircleUserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MobileShell } from '@/components/layout/MobileShell';
import { StatePanel } from '@/components/ui/StatePanel';

import { listOrders, type Order } from '@/lib/go-listings/orders';
import { getGoSession } from '@/lib/go-auth/client';

import { orderStatusLabel } from '@/lib/go-listings/order-display';
function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  return `${days}일 전`;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getGoSession().then((sessionResult) => {
      if (!active) return;
      if (!sessionResult.ok) {
        setError('로그인이 필요합니다.');
        setLoading(false);
        return;
      }
      void listOrders().then((result) => {
        if (!active) return;
        if (result.ok) {
          setOrders(result.data.orders);
        } else {
          setError(result.message ?? '주문 목록을 불러올 수 없습니다.');
        }
        setLoading(false);
      });
    });
    return () => { active = false; };
  }, []);

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
            actions={<Link href="/auth" className="btn-primary">로그인하기</Link>}
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
  const statusLabel = orderStatusLabel(order);
  const statusColor = order.paymentStatus === 'approved' ? 'green'
    : order.paymentStatus === 'cancelled' || order.status === 'cancelled' ? '#999'
    : order.paymentStatus === 'pending_approval' || order.paymentStatus === 'pending_cancel' ? '#f59e0b'
    : '#3b82f6';

  return (
    <Link href={`/order/${order.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '16px',
        transition: 'box-shadow 0.2s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <strong>{order.itemName}</strong>
          <span style={{
            color: statusColor,
            fontSize: '13px',
            fontWeight: 600,
            padding: '2px 8px',
            background: statusColor + '18',
            borderRadius: 12,
          }}>{statusLabel}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#666' }}>
          <span>KRW {order.totalAmountKrw.toLocaleString()}</span>
          <span>{formatRelative(order.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

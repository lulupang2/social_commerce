'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

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
    <div className="container" style={{ padding: '16px', maxWidth: '720px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '20px', marginBottom: '16px' }}>내 주문 내역</h1>
      <nav aria-label="주문 탐색" style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <Link href="/profile">← 마이페이지</Link>
        <Link href="/market">마켓으로 가기</Link>
      </nav>

      {loading ? (
        <p>로딩 중...</p>
      ) : error ? (
        <div style={{ color: 'var(--danger)', padding: '16px', background: '#fff5f5', borderRadius: 8 }}>
          <p>{error}</p>
          <Link href="/auth" className="btn-primary">로그인하기</Link>
        </div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <p style={{ color: '#666' }}>아직 주문 내역이 없습니다.</p>
          <Link href="/market" className="btn-primary">마켓으로 가기</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
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

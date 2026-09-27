'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import { cancelOrder, getOrder, receiveOrder, type Order } from '@/lib/go-listings/orders';
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

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canceling, setCanceling] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);

  useEffect(() => {
    let active = true;
    void getGoSession().then((result) => { if (active && result.ok) setViewerId(result.session.member.id); });
    void getOrder(id).then((result) => {
      if (!active) return;
      if (result.ok) {
        setOrder(result.data);
      } else {
        setError(result.message ?? '주문 정보를 불러올 수 없습니다.');
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [id]);

  const handleCancel = useCallback(async () => {
    if (!order || canceling) return;
    setCanceling(true);
    const result = await cancelOrder(order.id);
    setCanceling(false);
    if (result.ok) {
      setOrder(result.data);
      setCancelConfirm(false);
    } else {
      alert(result.message ?? '취소에 실패했습니다.');
    }
  }, [order, canceling]);

  const handleReceive = async () => {
    if (!order || receiving) return;
    setReceiving(true);
    const result = await receiveOrder(order.id);
    if (result.ok) setOrder(result.data);
    else alert(result.message);
    setReceiving(false);
  };

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center' }}>로딩 중...</div>;
  }

  if (error || !order) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p>{error || '주문을 찾을 수 없습니다.'}</p>
        <Link href="/orders" className="btn-primary">주문 목록으로</Link>
      </div>
    );
  }

  const statusLabel = orderStatusLabel(order);
  const canCancel = order.status === 'pending' && order.paymentStatus === 'unpaid' && order.buyerId === viewerId;

  return (
    <div className="container" style={{ padding: '16px', maxWidth: '720px', margin: '0 auto' }}>
      <nav aria-label="주문 탐색" style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <Link href="/orders">← 주문 목록</Link>
        <Link href="/market">마켓으로 가기</Link>
        {order.buyerId !== viewerId ? <Link href="/seller/orders">판매 주문 목록</Link> : null}
      </nav>

      <h1 style={{ fontSize: '20px', marginBottom: '16px' }}>주문 상세</h1>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px' }}>
        {/* Status badge */}
        <div style={{ marginBottom: '16px' }}>
          <span style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: 16,
            fontSize: '13px',
            fontWeight: 600,
            background: order.paymentStatus === 'approved' ? '#dcfce7'
              : order.status === 'cancelled' || order.paymentStatus === 'cancelled' ? '#f3f4f6'
              : '#fef3c7',
            color: order.paymentStatus === 'approved' ? '#166534'
              : order.status === 'cancelled' || order.paymentStatus === 'cancelled' ? '#6b7280'
              : '#92400e',
          }}>{statusLabel}</span>
          <p>전달 상태: {order.status === 'cancelled' ? '주문 취소' : ({
            awaiting_acceptance: '판매자 접수 대기',
            accepted: '판매자 접수 · 전달 대기',
            handed_over: '전달/발송 완료 · 수령 확인 대기',
            completed: '수령 확인 · 거래 완료',
          } as const)[order.fulfillmentStatus]}</p>
        </div>

        {/* Order items */}
        <div style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '16px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>{order.itemName}</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span>단가: KRW {order.unitPriceKrw.toLocaleString()}</span>
            <span>수량: {order.quantity}</span>
          </div>
        </div>

        {/* Totals */}
        <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#666', marginBottom: '8px' }}>
            <span>배송비</span><span>KRW {order.shippingFeeKrw.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#666', marginBottom: '8px' }}>
            <span>수수료</span><span>KRW {order.serviceFeeKrw.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700 }}>
            <span>총 결제 금액</span><span>KRW {order.totalAmountKrw.toLocaleString()}</span>
          </div>
        </div>

        {/* Metadata */}
        <div style={{ marginTop: '16px', fontSize: '13px', color: '#9ca3af' }}>
          <p>주문일: {formatRelative(order.createdAt)}</p>
          <p>상태: {order.paymentStatus.replace(/_/g, ' ')}</p>
        </div>

        {canCancel && <p><Link className="btn-primary" href={`/order/confirm/${order.id}`}>테스트 결제 계속하기</Link></p>}
        {order.buyerId === viewerId && (order.paymentStatus === 'pending_cancel' || (order.paymentStatus === 'approved' && (order.fulfillmentStatus === 'awaiting_acceptance' || order.fulfillmentStatus === 'accepted'))) && <p><Link href={`/order/confirm/${order.id}`}>결제 상태 확인 · 전체 취소</Link></p>}
        {order.buyerId === viewerId && order.status === 'confirmed' && order.paymentStatus === 'approved' && order.fulfillmentStatus === 'handed_over' ?
          <button className="btn-primary" type="button" disabled={receiving} onClick={() => void handleReceive()}>물품 수령 확인 · 거래 완료</button> : null}
        {/* Cancel button */}
        {canCancel && !cancelConfirm && (
          <button className="btn-outline" onClick={() => setCancelConfirm(true)} style={{ width: '100%', marginTop: '16px' }}>
            주문 취소하기
          </button>
        )}

        {canCancel && cancelConfirm && (
          <div style={{ marginTop: '16px', padding: '12px', background: '#fff5f5', borderRadius: 8 }}>
            <p style={{ fontSize: '14px', marginBottom: '8px' }}>정말로 이 주문을 취소하시겠습니까?</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-primary" disabled={canceling} onClick={handleCancel} style={{ flex: 1 }}>
                {canceling ? '취소 처리 중...' : '확인'}
              </button>
              <button className="btn-outline" onClick={() => setCancelConfirm(false)} style={{ flex: 1 }}>
                취소
              </button>
            </div>
          </div>
        )}

        {!canCancel && order.status !== 'confirmed' && (
          <p style={{ marginTop: '16px', fontSize: '13px', color: '#999' }}>
            현재 상태에서는 주문을 취소할 수 없습니다.
          </p>
        )}

        {order.paymentStatus === 'approved' && (
          <div style={{ marginTop: '16px', padding: '12px', background: '#ecfdf5', borderRadius: 8 }}>
            <p style={{ fontSize: '14px', color: '#166534' }}>테스트 결제 승인이 확인되었습니다. 실제 결제·배송은 진행되지 않습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

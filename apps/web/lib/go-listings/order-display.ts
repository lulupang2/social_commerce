import type { Order } from '@icegear/domain';

export function orderStatusColor(order: Order): string {
  if (order.paymentStatus === 'approved') return 'var(--success)';
  if (order.paymentStatus === 'cancelled' || order.status === 'cancelled') return 'var(--text-muted)';
  if (order.paymentStatus === 'failed') return 'var(--danger)';
  if (order.paymentStatus === 'pending_approval' || order.paymentStatus === 'pending_cancel') return 'var(--accent-hover)';
  return 'var(--primary)';
}

export function orderFulfillmentLabel(order: Order, audience: 'buyer' | 'seller' = 'buyer'): string {
  if (order.status === 'cancelled') return '주문 취소';
  const labels = {
    awaiting_acceptance: '판매자 접수 대기',
    accepted: audience === 'seller' ? '접수 완료 · 전달 대기' : '판매자 접수 · 전달 대기',
    handed_over: audience === 'seller' ? '전달 완료 · 구매자 수령 대기' : '전달/발송 완료 · 수령 확인 대기',
    completed: audience === 'seller' ? '구매자 수령 확인 · 거래 완료' : '수령 확인 · 거래 완료',
  };
  return labels[order.fulfillmentStatus];
}

export function orderStatusLabel(order: Order): string {
  switch (order.paymentStatus) {
    case 'pending_approval': return '결제 결과 확인 중';
    case 'pending_cancel': return '전체 취소 확인 중';
    case 'cancelled': return '결제 전체 취소 완료';
    case 'approved': return '테스트 결제 승인 완료';
    case 'failed': return '결제 실패';
    case 'unpaid': return order.status === 'cancelled' ? '주문 취소됨' : '결제 대기';
  }
}

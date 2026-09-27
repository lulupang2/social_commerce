import type { Order } from '@icegear/domain';

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

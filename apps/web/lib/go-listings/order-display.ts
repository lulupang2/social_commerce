import { translate } from '@/lib/i18n/translate';
import { browserLocale, intlLocale } from '@/lib/i18n/locale';
import type { Order } from '@icegear/domain';

export function orderProgressLabel(order: Order): string {
  if (order.paymentStatus !== 'approved') return orderStatusLabel(order);
  if (order.status === 'cancelled') return translate('주문 취소됨');
  return ({ awaiting_acceptance: translate('판매자 접수 대기'), accepted: translate('전달 준비 중'), handed_over: translate('수령 확인 대기'), completed: translate('거래 완료') } as const)[order.fulfillmentStatus];
}

export function orderDeliveryLabel(order: Order): string {
  if (order.status === 'cancelled' || order.paymentStatus === 'cancelled') return translate('주문이 취소되어 전달이 진행되지 않아요.');
  if (order.paymentStatus === 'pending_cancel') return translate('취소 결과를 확인하고 있어요. 결과 확인 후 진행해 주세요.');
  if (order.paymentStatus !== 'approved') return translate('결제 승인 후 판매자가 전달을 준비해요.');
  return ({
    awaiting_acceptance: translate('판매자의 주문 접수를 기다리고 있어요.'),
    accepted: translate('판매자가 주문을 접수하고 전달을 준비하고 있어요.'),
    handed_over: translate('판매자가 전달·발송을 완료했어요. 물품을 받았다면 수령을 확인해 주세요.'),
    completed: translate('수령을 확인한 주문이에요. 거래가 완료되었어요.'),
  } as const)[order.fulfillmentStatus];
}

export function orderActions(order: Order, viewerId: string | null) {
  const buyer = order.buyerId === viewerId;
  return {
    pay: buyer && order.status === 'pending' && order.paymentStatus === 'unpaid',
    receive: buyer && order.status === 'confirmed' && order.paymentStatus === 'approved' && order.fulfillmentStatus === 'handed_over',
    payment: buyer && (order.paymentStatus === 'pending_approval' || order.paymentStatus === 'pending_cancel' ||
      (order.status === 'confirmed' && order.paymentStatus === 'approved' && ['awaiting_acceptance', 'accepted'].includes(order.fulfillmentStatus))),
  };
}

export function formatOrderDate(date: string, locale: string = browserLocale()): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
}

export function orderStatusColor(order: Order): string {
  if (order.paymentStatus === 'approved') return 'var(--success)';
  if (order.paymentStatus === 'cancelled' || order.status === 'cancelled') return 'var(--text-muted)';
  if (order.paymentStatus === 'failed') return 'var(--danger)';
  if (order.paymentStatus === 'pending_approval' || order.paymentStatus === 'pending_cancel') return 'var(--accent-hover)';
  return 'var(--primary)';
}

export function orderFulfillmentLabel(order: Order, audience: 'buyer' | 'seller' = 'buyer'): string {
  if (order.status === 'cancelled') return translate('주문 취소');
  const labels = {
    awaiting_acceptance: translate('판매자 접수 대기'),
    accepted: audience === 'seller' ? translate('접수 완료 · 전달 대기') : translate('판매자 접수 · 전달 대기'),
    handed_over: audience === 'seller' ? translate('전달 완료 · 구매자 수령 대기') : translate('전달/발송 완료 · 수령 확인 대기'),
    completed: audience === 'seller' ? translate('구매자 수령 확인 · 거래 완료') : translate('수령 확인 · 거래 완료'),
  };
  return labels[order.fulfillmentStatus];
}

export function orderStatusLabel(order: Order): string {
  switch (order.paymentStatus) {
    case 'pending_approval': return translate('결제 결과 확인 중');
    case 'pending_cancel': return translate('전체 취소 확인 중');
    case 'cancelled': return translate('결제 전체 취소 완료');
    case 'approved': return translate('테스트 결제 승인 완료');
    case 'failed': return translate('결제 실패');
    case 'unpaid': return order.status === 'cancelled' ? translate('주문 취소됨') : translate('결제 대기');
  }
}

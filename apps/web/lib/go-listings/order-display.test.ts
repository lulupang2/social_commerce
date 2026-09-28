import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order } from '@icegear/domain';
import { orderFulfillmentLabel, orderStatusColor, orderStatusLabel } from './order-display';

test('unresolved payment and cancellation outrank confirmed order status', () => {
  const order = { status: 'confirmed', paymentStatus: 'approved' } as Order;
  assert.equal(orderStatusLabel(order), '테스트 결제 승인 완료');
  assert.equal(orderStatusLabel({ ...order, paymentStatus: 'pending_approval' }), '결제 결과 확인 중');
  assert.equal(orderStatusLabel({ ...order, paymentStatus: 'pending_cancel' }), '전체 취소 확인 중');
  assert.equal(orderStatusLabel({ ...order, paymentStatus: 'cancelled' }), '결제 전체 취소 완료');
  assert.equal(orderStatusLabel({ ...order, paymentStatus: 'failed' }), '결제 실패');
});

test('payment approval does not imply delivery completion', () => {
  const order = { status: 'confirmed', paymentStatus: 'approved', fulfillmentStatus: 'awaiting_acceptance' } as Order;
  assert.equal(orderFulfillmentLabel(order), '판매자 접수 대기');
  assert.equal(orderStatusLabel(order), '테스트 결제 승인 완료');
  assert.equal(orderFulfillmentLabel({ ...order, fulfillmentStatus: 'handed_over' }, 'seller'), '전달 완료 · 구매자 수령 대기');
  assert.equal(orderFulfillmentLabel({ ...order, fulfillmentStatus: 'completed' }), '수령 확인 · 거래 완료');
  assert.equal(orderFulfillmentLabel({ ...order, status: 'cancelled' }), '주문 취소');
  assert.equal(orderStatusColor({ ...order, paymentStatus: 'pending_cancel' }), 'var(--accent-hover)');
});

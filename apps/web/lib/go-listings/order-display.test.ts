import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order } from '@icegear/domain';
import { orderFulfillmentLabel, orderStatusColor, orderStatusLabel, orderProgressLabel, orderDeliveryLabel, orderActions, formatOrderDate } from './order-display';

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

test('payment approval is not receipt; unresolved payments outrank fulfillment', () => {
  const order = { buyerId: 'buyer', status: 'confirmed', paymentStatus: 'approved', fulfillmentStatus: 'awaiting_acceptance' } as Order;
  assert.equal(orderProgressLabel(order), '판매자 접수 대기');
  assert.equal(orderProgressLabel({ ...order, fulfillmentStatus: 'accepted' }), '전달 준비 중');
  assert.equal(orderProgressLabel({ ...order, fulfillmentStatus: 'handed_over' }), '수령 확인 대기');
  assert.equal(orderProgressLabel({ ...order, fulfillmentStatus: 'completed' }), '거래 완료');
  for (const paymentStatus of ['pending_cancel', 'pending_approval', 'failed', 'cancelled'] as const) {
    assert.equal(orderProgressLabel({ ...order, paymentStatus, fulfillmentStatus: 'completed' }), orderStatusLabel({ ...order, paymentStatus }));
    assert.equal(orderActions({ ...order, paymentStatus, fulfillmentStatus: 'handed_over' }, 'buyer').receive, false);
  }
  assert.match(orderDeliveryLabel({ ...order, status: 'cancelled' }), /취소/);
  assert.match(orderDeliveryLabel({ ...order, paymentStatus: 'unpaid' }), /결제 승인 후/);
});

test('actions require the buyer and the exact server status preconditions', () => {
  const order = { buyerId: 'buyer', status: 'pending', paymentStatus: 'unpaid', fulfillmentStatus: 'awaiting_acceptance' } as Order;
  assert.deepEqual(orderActions(order, 'buyer'), { pay: true, receive: false, payment: false });
  for (const viewer of [null, 'seller', 'other']) {
    assert.deepEqual(orderActions(order, viewer), { pay: false, receive: false, payment: false });
    assert.deepEqual(orderActions({ ...order, status: 'confirmed', paymentStatus: 'approved', fulfillmentStatus: 'handed_over' }, viewer), { pay: false, receive: false, payment: false });
  }
  assert.equal(orderActions({ ...order, status: 'cancelled' }, 'buyer').pay, false);
  assert.equal(orderActions({ ...order, paymentStatus: 'failed' }, 'buyer').pay, false);
  const approved = { ...order, status: 'confirmed', paymentStatus: 'approved' } as Order;
  assert.equal(orderActions(approved, 'buyer').payment, true);
  assert.equal(orderActions(approved, 'buyer').receive, false);
  assert.equal(orderActions({ ...approved, fulfillmentStatus: 'handed_over' }, 'buyer').receive, true);
  assert.equal(orderActions({ ...approved, fulfillmentStatus: 'completed' }, 'buyer').receive, false);
  assert.equal(orderActions({ ...approved, status: 'cancelled', fulfillmentStatus: 'handed_over' }, 'buyer').receive, false);
});

test('order dates use Korea timezone', () => {
  assert.equal(formatOrderDate('2026-09-27T16:00:00Z'), '2026. 09. 28.');
});

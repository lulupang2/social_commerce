import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order } from '@icegear/domain';
import { orderStatusLabel } from './order-display';

test('unresolved payment and cancellation outrank confirmed order status', () => {
  const order = { status: 'confirmed', paymentStatus: 'approved' } as Order;
  assert.equal(orderStatusLabel(order), '테스트 결제 승인 완료');
  assert.equal(orderStatusLabel({ ...order, paymentStatus: 'pending_approval' }), '결제 결과 확인 중');
  assert.equal(orderStatusLabel({ ...order, paymentStatus: 'pending_cancel' }), '전체 취소 확인 중');
  assert.equal(orderStatusLabel({ ...order, paymentStatus: 'cancelled' }), '결제 전체 취소 완료');
  assert.equal(orderStatusLabel({ ...order, paymentStatus: 'failed' }), '결제 실패');
});

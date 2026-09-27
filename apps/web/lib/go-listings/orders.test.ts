import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cancelOrder, confirmPayment, refundOrder, createOrder, getOrder, listOrders, type Order } from './orders';

const id = '11111111-1111-4111-8111-111111111111';
const order: Order = {
  id, buyerId: id, sellerId: id, listingId: id, itemName: '테스트 보드',
  unitPriceKrw: 12000, quantity: 1, shippingFeeKrw: 0, serviceFeeKrw: 0,
  totalAmountKrw: 12000, currency: 'KRW', status: 'pending', paymentStatus: 'unpaid',
  fulfillmentStatus: 'awaiting_acceptance', acceptedAt: null, handedOverAt: null, receivedAt: null,
  createdAt: '2026-09-22T00:00:00Z', updatedAt: '2026-09-22T00:00:00Z',
};
const session = { member: { id }, csrfToken: 'fixture-csrf' };

test('order mutations attach session CSRF and unwrap cancel response', async (t) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/session')) return Response.json(session);
    assert.equal(new Headers(init?.headers).get('X-CSRF-Token'), 'fixture-csrf');
    assert.equal(init?.credentials, 'same-origin');
    return Response.json(url.endsWith('/cancel') ? { order: { ...order, status: 'cancelled' } } : order);
  });
  const created = await createOrder({ listingId: id, quantity: 1 });
  assert.ok(created.ok);
  const cancelled = await cancelOrder(id);
  assert.ok(cancelled.ok);
  assert.equal(cancelled.data.status, 'cancelled');
  assert.equal(calls.length, 4);
});

test('malformed success is not accepted as an order', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...order, buyerId: '', totalAmountKrw: -1 }));
  const result = await getOrder(id);
  assert.ok(!result.ok);
  assert.match(result.message, /응답/);
});

test('empty order list uses an array, never null', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ orders: [] }));
  assert.deepEqual(await listOrders(), { ok: true, status: 200, data: { orders: [] } });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ orders: null }));
  assert.equal((await listOrders()).ok, false);
});

test('unknown approval remains pending and lost response remains failure', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string) => url.endsWith('/auth/session')
    ? Response.json(session)
    : Response.json({ ...order, paymentStatus: 'pending_approval' }, { status: 202 }));
  const result = await confirmPayment(order);
  assert.ok(result.ok);
  assert.equal(result.status, 202);
  assert.equal(result.data.paymentStatus, 'pending_approval');
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('lost'); });
  assert.equal((await getOrder(id)).ok, false);
});

test('failed session never submits an order mutation', async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    calls.push(url); return Response.json({ message: 'Login required' }, { status: 401 });
  });
  const result = await createOrder({ listingId: id, quantity: 1 });
  assert.ok(!result.ok);
  assert.equal(result.status, 401);
  assert.deepEqual(calls, ['/api/v1/auth/session']);
});

test('Toss callbacks forward actual keys and full cancellation stays pending', async (t) => {
  t.mock.method(globalThis,'fetch',async (url: string, init?: RequestInit) => {
    if(url.endsWith('/auth/session')) return Response.json(session);
    assert.equal(new Headers(init?.headers).get('X-CSRF-Token'),'fixture-csrf');
    if(url.endsWith('/payments/confirm')) {
      assert.deepEqual(JSON.parse(String(init?.body)),{paymentKey:'toss-test-callback',amount:12000});
      return Response.json({...order,status:'confirmed',paymentStatus:'approved'});
    }
    assert.ok(url.endsWith('/refunds'));
    assert.deepEqual(JSON.parse(String(init?.body)),{});
    return Response.json({...order,status:'confirmed',paymentStatus:'pending_cancel'},{status:202});
  });
  assert.ok((await confirmPayment(order,{paymentKey:'toss-test-callback',amount:12000})).ok);
  const result=await refundOrder(id);
  assert.ok(result.ok);assert.equal(result.status,202);assert.equal(result.data.paymentStatus,'pending_cancel');
});

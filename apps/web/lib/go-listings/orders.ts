'use client';

import { createOrderInputSchema, orderSchema, orderListResponseSchema, type Order, type CreateOrderInput } from '@icegear/domain';
import { z } from 'zod';
import { getGoSession } from '../go-auth/client';

export type { Order, CreateOrderInput };
export { createOrderInputSchema, orderSchema };
export type ApiResponse<T> = { ok: true; status: number; data: T } | { ok: false; status: number; message: string };

async function apiFetch<T>(url: string, schema: z.ZodType<T>, body?: unknown): Promise<ApiResponse<T>> {
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) {
      const session = await getGoSession();
      if (!session.ok) return { ok: false, status: session.status ?? 0, message: session.message };
      headers['X-CSRF-Token'] = session.session.csrfToken;
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const response: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const error = z.object({ message: z.string().optional() }).safeParse(response);
      return { ok: false, status: res.status, message: error.success && error.data.message ? error.data.message : '주문 요청을 처리하지 못했어요.' };
    }
    const parsed = schema.safeParse(response);
    if (!parsed.success) return { ok: false, status: res.status, message: '서버의 주문 응답을 확인할 수 없어요. 주문 내역을 다시 확인해 주세요.' };
    return { ok: true, status: res.status, data: parsed.data };
  } catch {
    return { ok: false, status: 0, message: '요청 결과를 확인하지 못했어요. 주문 내역을 확인한 뒤 다시 시도해 주세요.' };
  }
}
export function listOrders() { return apiFetch('/api/v1/orders', orderListResponseSchema); }
export function getOrder(orderId: string) { return apiFetch(`/api/v1/orders/${encodeURIComponent(orderId)}`, orderSchema); }
export function createOrder(input: CreateOrderInput): Promise<ApiResponse<Order>> {
  const parsed = createOrderInputSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve({ ok: false, status: 400, message: '상품과 수량을 확인해 주세요.' });
  return apiFetch('/api/v1/orders', orderSchema, parsed.data);
}
export async function cancelOrder(orderId: string): Promise<ApiResponse<Order>> {
  const result = await apiFetch(`/api/v1/orders/${encodeURIComponent(orderId)}/cancel`, z.object({ order: orderSchema }).strict(), {});
  return result.ok ? { ...result, data: result.data.order } : result;
}
export function confirmPayment(order: Order, payment?: {paymentKey: string; amount: number}): Promise<ApiResponse<Order>> {
  return apiFetch(`/api/v1/orders/${encodeURIComponent(order.id)}/payments/confirm`, orderSchema, payment ?? { paymentKey: `fake-pay-${order.id}`, amount: order.totalAmountKrw });
}
const paymentConfigSchema = z.object({provider:z.enum(['toss_test','fake_toss']),clientKey:z.string(),customerKey:z.string().uuid()}).strict();
export function getPaymentConfig(id: string) { return apiFetch(`/api/v1/orders/${encodeURIComponent(id)}/payments/config`, paymentConfigSchema); }
export function listSellerOrders() { return apiFetch('/api/v1/seller/orders', orderListResponseSchema); }
export function acceptSellerOrder(id: string) {
  return apiFetch(`/api/v1/seller/orders/${encodeURIComponent(id)}/accept`, orderSchema, {});
}
export function handOverSellerOrder(id: string) {
  return apiFetch(`/api/v1/seller/orders/${encodeURIComponent(id)}/hand-over`, orderSchema, {});
}
export function receiveOrder(id: string) {
  return apiFetch(`/api/v1/orders/${encodeURIComponent(id)}/receive`, orderSchema, {});
}
export function refundOrder(id: string) { return apiFetch(`/api/v1/orders/${encodeURIComponent(id)}/refunds`,orderSchema,{}); }

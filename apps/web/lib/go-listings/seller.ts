'use client';

import {
  inventoryViewSchema,
  sellerApplicationSchema,
  sellerStatusSchema,
  type InventoryView,
  type SellerApplication,
  type SellerStatus,
} from '@icegear/domain';
import { z } from 'zod';
import { requestJson, type JsonResult } from '../api/json-request';
type ApiResponse<T> = JsonResult<T>;

async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown, method = 'POST'): Promise<ApiResponse<T>> {
  return requestJson(path, schema, {
    method: body === undefined ? 'GET' : method, body,
    messages: {
      http: '요청을 처리하지 못했어요.',
      invalid: '서버 응답을 확인할 수 없어요.',
      network: '요청 결과를 확인하지 못했어요. 상태를 확인해 주세요.',
    },
  });
}

export function getSellerStatus(): Promise<ApiResponse<SellerStatus>> {
  return request('/api/v1/me/seller-application', sellerStatusSchema);
}
export function applyForSeller(type: 'individual' | 'business', displayName: string): Promise<ApiResponse<SellerApplication>> {
  return request('/api/v1/me/seller-application', sellerApplicationSchema, { type, displayName });
}
export function listSellerApplications() {
  return request('/api/v1/seller-applications', z.object({ items: z.array(sellerApplicationSchema) }).strict());
}
export function reviewSellerApplication(id: string, decision: 'approve' | 'reject', reason = '') {
  return request(`/api/v1/seller-applications/${encodeURIComponent(id)}/${decision}`, sellerApplicationSchema, { reason });
}
export function getOwnerInventory(id: string) {
  return request(`/api/v1/listings/${encodeURIComponent(id)}/inventory`, z.object({ inventory: inventoryViewSchema.nullable() }).strict());
}
export function setOwnerInventory(id: string, availableQuantity: 0 | 1): Promise<ApiResponse<InventoryView>> {
  return request(`/api/v1/listings/${encodeURIComponent(id)}/inventory`, inventoryViewSchema, { availableQuantity }, 'PUT');
}

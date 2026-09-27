import { z } from 'zod';

import { isoTimestampSchema, uuidSchema } from './common.js';

export const ORDER_STATUSES = ['pending', 'cancelled', 'confirmed'] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);

export const PAYMENT_STATUSES = ['unpaid', 'pending_approval', 'approved', 'failed', 'pending_cancel', 'cancelled'] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

export const orderFulfillmentStatusSchema = z.enum(['awaiting_acceptance', 'accepted', 'handed_over', 'completed']);

export const reservationStateSchema = z.enum(['active', 'consumed', 'expired', 'released']);

export const orderItemSchema = z.object({
  id: uuidSchema,
  listingId: uuidSchema,
  itemName: z.string().min(1).max(120),
  unitPriceKrw: z.number().int().positive(),
  quantity: z.literal(1),
  lineTotalKrw: z.number().int().positive(),
  createdAt: isoTimestampSchema,
}).strict();
export type OrderItem = z.infer<typeof orderItemSchema>;

export const reservationSchema = z.object({
  id: uuidSchema,
  listingId: uuidSchema,
  orderId: uuidSchema,
  quantity: z.literal(1),
  expiresAt: isoTimestampSchema,
  state: reservationStateSchema,
});
export type Reservation = z.infer<typeof reservationSchema>;

export const orderSchema = z.object({
  id: uuidSchema,
  buyerId: uuidSchema,
  sellerId: uuidSchema,
  listingId: uuidSchema,
  itemName: z.string().min(1).max(120),
  unitPriceKrw: z.number().int().positive(),
  quantity: z.literal(1),
  shippingFeeKrw: z.number().int().min(0),
  serviceFeeKrw: z.number().int().min(0),
  totalAmountKrw: z.number().int().positive(),
  currency: z.literal('KRW'),
  status: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  fulfillmentStatus: orderFulfillmentStatusSchema,
  acceptedAt: isoTimestampSchema.nullable(),
  handedOverAt: isoTimestampSchema.nullable(),
  receivedAt: isoTimestampSchema.nullable(),
  items: z.array(orderItemSchema).optional(),
  reservation: reservationSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).strict();
export type Order = z.infer<typeof orderSchema>;

export const createOrderInputSchema = z.object({
  listingId: uuidSchema,
  quantity: z.literal(1),
}).strict();
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

export const orderListResponseSchema = z.object({
  orders: z.array(orderSchema),
}).strict();
export type OrderListResponse = z.infer<typeof orderListResponseSchema>;

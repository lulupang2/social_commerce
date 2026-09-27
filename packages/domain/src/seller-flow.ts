import { z } from 'zod';

import { isoTimestampSchema, uuidSchema } from './common.js';

export const sellerApplicationSchema = z.object({
  id: uuidSchema,
  applicantId: uuidSchema,
  type: z.enum(['individual', 'business']),
  displayName: z.string().min(1).max(120),
  status: z.enum(['pending', 'approved', 'rejected']),
  sellerId: uuidSchema.nullable(),
  reason: z.string().nullable(),
  reviewedBy: uuidSchema.nullable(),
  createdAt: isoTimestampSchema,
  reviewedAt: isoTimestampSchema.nullable(),
}).strict();
export type SellerApplication = z.infer<typeof sellerApplicationSchema>;

export const sellerStatusSchema = z.object({
  application: sellerApplicationSchema.nullable(),
  seller: z.object({ id: uuidSchema, displayName: z.string(), status: z.string() }).strict().nullable(),
  reviewer: z.boolean(),
}).strict();
export type SellerStatus = z.infer<typeof sellerStatusSchema>;

export const inventoryViewSchema = z.object({
  listingId: uuidSchema,
  sellerId: uuidSchema,
  availableQuantity: z.number().int().min(0).max(1),
  reservedQuantity: z.number().int().nonnegative(),
}).strict();
export type InventoryView = z.infer<typeof inventoryViewSchema>;

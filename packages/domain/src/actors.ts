import { z } from 'zod';

import {
  httpsUrlSchema,
  isoTimestampSchema,
  nonEmptyTrimmedTextSchema,
  uuidSchema,
} from './common.js';
import { locationObjectSchema, moneySchema } from './listings.js';
import { sportSchema } from './sports.js';

export const SELLER_TYPES = ['individual', 'shop', 'brand'] as const;
export type SellerType = (typeof SELLER_TYPES)[number];
export const sellerTypeSchema = z.enum(SELLER_TYPES);

export const sellerSchema = z
  .object({
    id: uuidSchema,
    displayName: nonEmptyTrimmedTextSchema.max(80),
    username: z.string().trim().min(2).max(30).optional(),
    accountType: sellerTypeSchema,
    avatarUrl: httpsUrlSchema.optional(),
    bio: z.string().trim().max(500).optional(),
    location: locationObjectSchema.optional(),
    sports: z.array(sportSchema).max(2).optional(),
    rating: z.number().finite().min(0).max(5).optional(),
    ratingCount: z.number().int().nonnegative().optional(),
    verified: z.boolean().optional(),
    createdAt: isoTimestampSchema,
  })
  .strict();

export type Seller = z.infer<typeof sellerSchema>;

export const TRANSACTION_STATUSES = [
  'pending',
  'accepted',
  'payment_pending',
  'paid',
  'fulfilling',
  'shipped',
  'completed',
  'cancelled',
  'disputed',
  'refunded',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
export const transactionStatusSchema = z.enum(TRANSACTION_STATUSES);

export const FULFILLMENT_STATUSES = [
  'not_started',
  'pickup_scheduled',
  'ready_for_pickup',
  'shipped',
  'delivered',
  'complete',
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];
export const fulfillmentStatusSchema = z.enum(FULFILLMENT_STATUSES);

export const PAYMENT_METHODS = ['card', 'cash', 'bank_transfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export const transactionSchema = z
  .object({
    id: uuidSchema,
    listingId: uuidSchema,
    buyerId: uuidSchema,
    sellerId: uuidSchema,
    amount: moneySchema,
    status: transactionStatusSchema,
    fulfillmentStatus: fulfillmentStatusSchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
    shippingAddress: locationObjectSchema.optional(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    completedAt: isoTimestampSchema.optional(),
  })
  .strict();

export type Transaction = z.infer<typeof transactionSchema>;

export const REPORT_TARGET_TYPES = ['listing', 'profile', 'post', 'comment', 'message'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];
export const reportTargetTypeSchema = z.enum(REPORT_TARGET_TYPES);

export const REPORT_REASONS = [
  'spam',
  'scam',
  'counterfeit',
  'prohibited_item',
  'harassment',
  'hate_speech',
  'unsafe_meetup',
  'copyright',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const reportReasonSchema = z.enum(REPORT_REASONS);

export const REPORT_STATUSES = [
  'pending',
  'open',
  'under_review',
  'resolved',
  'dismissed',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const reportStatusSchema = z.enum(REPORT_STATUSES);

export const reportSchema = z
  .object({
    id: uuidSchema,
    reporterId: uuidSchema,
    targetType: reportTargetTypeSchema,
    targetId: uuidSchema,
    reason: reportReasonSchema,
    details: z.string().trim().min(1).max(2_000).optional(),
    status: reportStatusSchema,
    createdAt: isoTimestampSchema,
    resolvedAt: isoTimestampSchema.optional(),
    resolutionNote: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

export type Report = z.infer<typeof reportSchema>;

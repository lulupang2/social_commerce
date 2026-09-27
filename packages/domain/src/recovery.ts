import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './common.js';

export const paymentRecoveryRequestSchema = z.object({
  id: uuidSchema, orderId: uuidSchema, attemptId: uuidSchema, actorMemberId: uuidSchema,
  reason: z.string(), status: z.enum(['queued', 'checked', 'failed']),
  jobId: z.number().int().nullable(), lastErrorCode: z.string().nullable(),
  requestedAt: isoTimestampSchema, finishedAt: isoTimestampSchema.nullable(),
}).strict();
export type PaymentRecoveryRequest = z.infer<typeof paymentRecoveryRequestSchema>;

export const recoveryDashboardSchema = z.object({
  attempts: z.array(z.object({
    id: uuidSchema, orderId: uuidSchema, status: z.string(), paymentStatus: z.string(),
    updatedAt: isoTimestampSchema, recheckable: z.boolean(),
  }).strict()),
  jobs: z.array(z.object({
    id: z.number().int(), kind: z.string(), state: z.string(), attempt: z.number().int(), createdAt: isoTimestampSchema,
  }).strict()),
  notifications: z.array(z.object({
    id: uuidSchema, kind: z.string(), attempts: z.number().int(),
    lastErrorCode: z.string().nullable(), createdAt: isoTimestampSchema,
  }).strict()),
  paymentEvents: z.array(z.object({
    id: uuidSchema, orderId: uuidSchema.nullable(), state: z.string(), retries: z.number().int(), verified: z.boolean(),
  }).strict()),
  requests: z.array(paymentRecoveryRequestSchema),
}).strict();
export type RecoveryDashboard = z.infer<typeof recoveryDashboardSchema>;

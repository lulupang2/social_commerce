import { z } from 'zod';

import { isoTimestampSchema, nonEmptyTrimmedTextSchema, uuidSchema } from './common.js';

export const CONVERSATION_STATUSES = ['active', 'archived', 'blocked'] as const;
export const conversationStatusSchema = z.enum(CONVERSATION_STATUSES);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const chatMessageSchema = z
  .object({
    id: uuidSchema,
    conversationId: uuidSchema,
    senderId: uuidSchema,
    body: nonEmptyTrimmedTextSchema.max(10_000),
    readAt: isoTimestampSchema.nullable(),
    createdAt: isoTimestampSchema,
  })
  .strict();
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const createChatMessageSchema = z
  .object({
    conversationId: uuidSchema,
    body: nonEmptyTrimmedTextSchema.max(10_000),
  })
  .strict();
export type CreateChatMessage = z.infer<typeof createChatMessageSchema>;

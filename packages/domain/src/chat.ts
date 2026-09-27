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
    body: nonEmptyTrimmedTextSchema.max(5_000),
    readAt: isoTimestampSchema.nullable(),
    createdAt: isoTimestampSchema,
  })
  .strict();
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const createChatMessageSchema = z
  .object({
    conversationId: uuidSchema,
    body: nonEmptyTrimmedTextSchema.max(5_000),
  })
  .strict();
export type CreateChatMessage = z.infer<typeof createChatMessageSchema>;

export const conversationPageSchema = z.object({
  id: uuidSchema,
  currentUserId: uuidSchema,
  otherUserName: z.string(),
  listing: z.object({ id: uuidSchema, title: z.string(), price: z.number().int() }).strict().nullable(),
  messages: z.array(chatMessageSchema),
  beforeCursor: z.string().nullable(),
  afterCursor: z.string().nullable(),
  hasMore: z.boolean(),
}).strict();
export type ConversationPage = z.infer<typeof conversationPageSchema>;

export const conversationSummarySchema = z.object({
  id: uuidSchema, listingId: uuidSchema, listingTitle: z.string(), listingPrice: z.number().int().nullable(),
  otherUserName: z.string(), lastMessage: z.string(),
  lastMessageTime: isoTimestampSchema.nullable(), unreadCount: z.number().int().nonnegative(),
}).strict();

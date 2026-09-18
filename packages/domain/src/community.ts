import { z } from 'zod';

import { isoTimestampSchema, nonEmptyTrimmedTextSchema, uuidSchema } from './common.js';
import { communityPostStatusSchema } from './publication.js';
import { sportSchema } from './sports.js';

export const COMMUNITY_POST_TYPES = [
  'discussion',
  'question',
  'guide',
  'meetup',
  'review',
] as const;
export type CommunityPostType = (typeof COMMUNITY_POST_TYPES)[number];
export const communityPostTypeSchema = z.enum(COMMUNITY_POST_TYPES);

export const createCommunityPostSchema = z
  .object({
    sport: sportSchema.optional(),
    type: communityPostTypeSchema,
    title: nonEmptyTrimmedTextSchema.max(160),
    body: nonEmptyTrimmedTextSchema.max(10_000),
    tags: z.array(nonEmptyTrimmedTextSchema.max(40)).max(20).optional(),
  })
  .strict();
export type CreateCommunityPost = z.infer<typeof createCommunityPostSchema>;

export const createCommunityCommentSchema = z
  .object({
    postId: uuidSchema,
    body: nonEmptyTrimmedTextSchema.max(5_000),
  })
  .strict();
export type CreateCommunityComment = z.infer<typeof createCommunityCommentSchema>;
export const COMMUNITY_REACTION_KINDS = ['like'] as const;
export type CommunityReactionKind = (typeof COMMUNITY_REACTION_KINDS)[number];
export const communityReactionKindSchema = z.enum(COMMUNITY_REACTION_KINDS);

export const communityReactionSchema = z
  .object({
    postId: uuidSchema,
    userId: uuidSchema,
    kind: z.literal('like'),
    createdAt: isoTimestampSchema,
  })
  .strict();

export type CommunityReaction = z.infer<typeof communityReactionSchema>;

export const communityReactionCollectionSchema = z
  .array(communityReactionSchema)
  .superRefine((reactions, context) => {
    const keys = new Set<string>();
    reactions.forEach((reaction, index) => {
      const key = `${reaction.postId}:${reaction.userId}`;
      if (keys.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: 'A user may like a post only once',
        });
      }
      keys.add(key);
    });
  });

export type CommunityReactionCollection = z.infer<typeof communityReactionCollectionSchema>;

export const communityAggregateCountsSchema = z
  .object({
    commentCount: z.number().int().nonnegative(),
    likeCount: z.number().int().nonnegative(),
    likedByMe: z.boolean().optional(),
  })
  .strict();

export type CommunityAggregateCounts = z.infer<typeof communityAggregateCountsSchema>;

export const communityPostSchema = z
  .object({
    id: uuidSchema,
    authorId: uuidSchema,
    sport: sportSchema.optional(),
    type: communityPostTypeSchema,
    status: communityPostStatusSchema,
    title: nonEmptyTrimmedTextSchema.max(160),
    body: nonEmptyTrimmedTextSchema.max(10_000),
    tags: z.array(nonEmptyTrimmedTextSchema.max(40)).max(20).optional(),
    counts: communityAggregateCountsSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export type CommunityPost = z.infer<typeof communityPostSchema>;

export const communityCommentSchema = z
  .object({
    id: uuidSchema,
    postId: uuidSchema,
    authorId: uuidSchema,
    body: nonEmptyTrimmedTextSchema.max(5_000),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema.optional(),
  })
  .strict();

export type CommunityComment = z.infer<typeof communityCommentSchema>;

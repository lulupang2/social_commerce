import { z } from 'zod';
import { uuidSchema } from './common.js';

export const memberSkillSchema = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);
export const memberProfileSchema = z.object({
  id: uuidSchema,
  displayName: z.string().max(80),
  surfSkill: memberSkillSchema,
  tennisSkill: memberSkillSchema,
  preferredSport: z.enum(['surf', 'tennis']).nullable(),
  maxBudgetKrw: z.number().int().min(1).max(999999999999).nullable(),
  preferredRegion: z.string().max(120),
  savedCount: z.number().int().nonnegative(),
  transactionCount: z.number().int().nonnegative(),
}).strict();
export const updateMemberProfileSchema = memberProfileSchema.pick({ displayName: true, surfSkill: true, tennisSkill: true, preferredSport: true, maxBudgetKrw: true, preferredRegion: true }).extend({ displayName: z.string().trim().min(1).max(80), preferredRegion: z.string().trim().max(120) }).strict();
export const memberFavoriteResultSchema = z.object({ listingId: uuidSchema, favorite: z.boolean() }).strict();
export type MemberProfile = z.infer<typeof memberProfileSchema>;
export type UpdateMemberProfile = z.infer<typeof updateMemberProfileSchema>;

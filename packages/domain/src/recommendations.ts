import { z } from 'zod';

import {
  isoTimestampSchema,
  nonEmptyTrimmedTextSchema,
  uuidSchema,
} from './common.js';
import { listingConditionSchema } from './listings.js';
import { profileSportPreferenceSchema } from './profiles.js';
import {
  SPORTS,
  surfListingDetailsSchema,
  tennisListingDetailsSchema,
} from './sports.js';

export const RECOMMENDATION_REASON_CODES = [
  'sport_match',
  'skill_match',
  'size_match',
  'preference_match',
  'condition_match',
  'recent_fallback',
  'popular_fallback',
] as const;
export type RecommendationReasonCode = (typeof RECOMMENDATION_REASON_CODES)[number];
export const recommendationReasonCodeSchema = z.enum(RECOMMENDATION_REASON_CODES);

export const RECOMMENDATION_LABEL = '맞춤 추천' as const;

export const recommendationReasonCodesSchema = z
  .array(recommendationReasonCodeSchema)
  .min(1)
  .max(RECOMMENDATION_REASON_CODES.length)
  .superRefine((codes, context) => {
    const uniqueCodes = new Set<RecommendationReasonCode>();
    codes.forEach((code, index) => {
      if (uniqueCodes.has(code)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: 'Recommendation reason codes must be unique per listing',
        });
      }
      uniqueCodes.add(code);
    });
  });

export const recommendationReasonSchema = z
  .object({
    reasonCodes: recommendationReasonCodesSchema,
    reasonText: nonEmptyTrimmedTextSchema.max(160),
  })
  .strict();

export type RecommendationReason = z.infer<typeof recommendationReasonSchema>;

export const recommendationProfileSportsSchema = z
  .array(profileSportPreferenceSchema)
  .max(SPORTS.length)
  .superRefine((sports, context) => {
    const sportIds = new Set<string>();
    sports.forEach((sport, index) => {
      if (sportIds.has(sport.sportId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'sportId'],
          message: 'Recommendation sport inputs must be unique',
        });
      }
      sportIds.add(sport.sportId);
    });
  });

export type RecommendationProfileSports = z.infer<
  typeof recommendationProfileSportsSchema
>;

const recommendationListingCoreFields = {
  listingId: uuidSchema,
  sportId: uuidSchema,
  status: z.literal('active'),
  condition: listingConditionSchema,
  createdAt: isoTimestampSchema,
  favoriteCount: z.number().int().nonnegative(),
};

export const surfRecommendationListingInputSchema = z
  .object({
    ...recommendationListingCoreFields,
    sport: z.literal('surf'),
    details: surfListingDetailsSchema,
  })
  .strict();

export type SurfRecommendationListingInput = z.infer<
  typeof surfRecommendationListingInputSchema
>;

export const tennisRecommendationListingInputSchema = z
  .object({
    ...recommendationListingCoreFields,
    sport: z.literal('tennis'),
    details: tennisListingDetailsSchema,
  })
  .strict();

export type TennisRecommendationListingInput = z.infer<
  typeof tennisRecommendationListingInputSchema
>;

export const recommendationListingInputSchema = z.discriminatedUnion('sport', [
  surfRecommendationListingInputSchema,
  tennisRecommendationListingInputSchema,
]);

export type RecommendationListingInput = z.infer<
  typeof recommendationListingInputSchema
>;

export const recommendationInputSchema = z
  .object({
    profileSports: recommendationProfileSportsSchema,
    listings: z.array(recommendationListingInputSchema).max(200),
    asOf: isoTimestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const listingIds = new Set<string>();
    value.listings.forEach((listing, index) => {
      if (listingIds.has(listing.listingId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['listings', index, 'listingId'],
          message: 'Recommendation listing inputs must be unique',
        });
      }
      listingIds.add(listing.listingId);
    });
  });

export type RecommendationInput = z.infer<typeof recommendationInputSchema>;

export const recommendationItemSchema = z
  .object({
    listingId: uuidSchema,
    reasonCodes: recommendationReasonCodesSchema,
    reasonText: nonEmptyTrimmedTextSchema.max(160),
    score: z.number().finite().min(0).max(100).optional(),
  })
  .strict();

export type RecommendationItem = z.infer<typeof recommendationItemSchema>;

export const recommendationResultSchema = z
  .object({
    source: z.literal('rules'),
    label: z.literal(RECOMMENDATION_LABEL),
    generatedAt: isoTimestampSchema.optional(),
    items: z.array(recommendationItemSchema).max(200),
  })
  .strict()
  .superRefine((value, context) => {
    const listingIds = new Set<string>();
    value.items.forEach((item, index) => {
      if (listingIds.has(item.listingId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'listingId'],
          message: 'Recommendation result listing IDs must be unique',
        });
      }
      listingIds.add(item.listingId);
    });
  });

export type RecommendationResult = z.infer<typeof recommendationResultSchema>;

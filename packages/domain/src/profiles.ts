import { z } from 'zod';
import { locationSchema, type LocationInput } from './listings.js';
import { skillLevelSchema, sportSchema, SPORTS, type SkillLevel, type Sport } from './sports.js';

export interface Profile {
  id: string;
  userId: string;
  username?: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  location?: LocationInput;
  preferredSports: Sport[];
  skillLevel?: SkillLevel;
  createdAt: string;
  updatedAt: string;
}

const displayNameSchema = z.string().trim().min(1, 'Display name is required').max(80);
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_][a-z0-9_-]{1,29}$/, 'Username must be 2-30 letters, numbers, _ or -');
const sportsSchema = z.array(sportSchema).min(1).max(SPORTS.length);
const optionalUrlSchema = z.string().trim().url().optional().nullable();

const profileFields = {
  displayName: displayNameSchema.optional(),
  name: displayNameSchema.optional(),
  username: usernameSchema.optional(),
  bio: z.string().trim().max(500).optional().nullable(),
  avatarUrl: optionalUrlSchema,
  location: locationSchema.optional().nullable(),
  preferredSports: sportsSchema.optional(),
  favoriteSports: sportsSchema.optional(),
  favoriteSport: sportSchema.optional(),
  skillLevel: skillLevelSchema.optional(),
};

/** Fields that can be edited after a profile exists. */
export const profileInputSchema = z
  .object(profileFields)
  .passthrough()
  .superRefine((value, context) => {
    if (!value.displayName && !value.name) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['displayName'],
        message: 'Display name is required',
      });
    }
  });

export const profileSchema = profileInputSchema;
export type ProfileInput = z.input<typeof profileInputSchema>;
export type UpdateProfileInput = ProfileInput;

/**
 * First-run profile data. Clients may use either preferredSports or favoriteSports
 * while migrating, but at least one sport preference is required.
 */
export const onboardingInputSchema = z
  .object({
    ...profileFields,
    preferredSports: sportsSchema.optional(),
    favoriteSports: sportsSchema.optional(),
    favoriteSport: sportSchema.optional(),
    acceptTerms: z.literal(true).optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (!value.displayName && !value.name) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['displayName'],
        message: 'Display name is required',
      });
    }

    if (!value.preferredSports && !value.favoriteSports && !value.favoriteSport) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preferredSports'],
        message: 'Choose at least one sport',
      });
    }
  });

export const onboardingSchema = onboardingInputSchema;
export type OnboardingInput = z.input<typeof onboardingInputSchema>;
export type OnboardingPayload = OnboardingInput;

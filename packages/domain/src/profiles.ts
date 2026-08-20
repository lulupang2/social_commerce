import { z } from 'zod';

import { httpsUrlSchema, isoTimestampSchema, uuidSchema } from './common.js';
import { locationObjectSchema } from './listings.js';
import {
  handednessSchema,
  skillLevelSchema,
  SPORTS,
  surfDisciplineSchema,
  tennisPlayStyleSchema,
  wetsuitThicknessSchema,
} from './sports.js';

export const APPAREL_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type ApparelSize = (typeof APPAREL_SIZES)[number];
export const apparelSizeSchema = z.enum(APPAREL_SIZES);

export const SHOE_SIZES_MM = [220, 230, 240, 250, 260, 270, 280, 290, 300] as const;

export const profileSizePreferencesSchema = z
  .object({
    shoeSizeMm: z.number().int().min(100).max(400).optional(),
    apparelSize: apparelSizeSchema.optional(),
    boardLengthFeet: z.number().finite().positive().max(20).optional(),
    volumeLiters: z.number().finite().positive().max(300).optional(),
    wetsuitThickness: wetsuitThicknessSchema.optional(),
    headSizeSqIn: z.number().finite().positive().max(150).optional(),
    weightGrams: z.number().finite().positive().max(600).optional(),
    gripSize: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

export type ProfileSizePreferences = z.infer<typeof profileSizePreferencesSchema>;

export const profileEquipmentPreferencesSchema = z
  .object({
    surfDiscipline: surfDisciplineSchema.optional(),
    tennisPlayStyle: tennisPlayStyleSchema.optional(),
    handedness: handednessSchema.optional(),
  })
  .strict();

export type ProfileEquipmentPreferences = z.infer<
  typeof profileEquipmentPreferencesSchema
>;

export const profileSportPreferenceSchema = z
  .object({
    sportId: uuidSchema,
    skillLevel: skillLevelSchema.nullish(),
    sizePreferences: profileSizePreferencesSchema.nullish(),
    preferences: profileEquipmentPreferencesSchema.nullish(),
  })
  .strict();

export type ProfileSportPreference = z.infer<typeof profileSportPreferenceSchema>;

export const profileSportsSchema = z
  .array(profileSportPreferenceSchema)
  .min(1, 'Choose at least one sport')
  .max(SPORTS.length)
  .superRefine((sports, context) => {
    const sportIds = new Set<string>();
    sports.forEach((sport, index) => {
      if (sportIds.has(sport.sportId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'sportId'],
          message: 'Each sport may appear only once',
        });
      }
      sportIds.add(sport.sportId);
    });
  });

export type ProfileSports = z.infer<typeof profileSportsSchema>;

const displayNameSchema = z.string().trim().min(1, 'Display name is required').max(80);
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_][a-z0-9_-]{1,29}$/, 'Username must be 2-30 letters, numbers, _ or -');

const editableProfileFields = {
  displayName: displayNameSchema,
  username: usernameSchema.optional().nullable(),
  bio: z.string().trim().max(500).optional().nullable(),
  avatarUrl: httpsUrlSchema.optional().nullable(),
  location: locationObjectSchema.optional().nullable(),
  sports: profileSportsSchema,
};

export const profileSchema = z
  .object({
    id: uuidSchema,
    ...editableProfileFields,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export type Profile = z.infer<typeof profileSchema>;

export const profileUpdateSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    username: usernameSchema.optional().nullable(),
    bio: z.string().trim().max(500).optional().nullable(),
    avatarUrl: httpsUrlSchema.optional().nullable(),
    location: locationObjectSchema.optional().nullable(),
    sports: profileSportsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one profile field is required');

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const onboardingPayloadSchema = z
  .object({
    displayName: displayNameSchema,
    username: usernameSchema.optional(),
    bio: z.string().trim().max(500).optional(),
    avatarUrl: httpsUrlSchema.optional(),
    location: locationObjectSchema.optional(),
    sports: profileSportsSchema,
    acceptTerms: z.literal(true).optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .strict();

export type OnboardingPayload = z.input<typeof onboardingPayloadSchema>;
export type Onboarding = z.output<typeof onboardingPayloadSchema>;

import { z } from 'zod';

export const SPORTS = ['ski', 'hockey'] as const;
export type Sport = (typeof SPORTS)[number];
export const sportSchema = z.enum(SPORTS);

export const SPORT_LABELS: Record<Sport, string> = {
  ski: 'Ski',
  hockey: 'Hockey',
};

export const SKI_DISCIPLINES = [
  'alpine',
  'cross_country',
  'freeride',
  'freestyle',
  'touring',
  'telemark',
  'other',
] as const;
export type SkiDiscipline = (typeof SKI_DISCIPLINES)[number];
export const skiDisciplineSchema = z.enum(SKI_DISCIPLINES);

export const HOCKEY_FORMATS = ['ice', 'street', 'roller', 'other'] as const;
export type HockeyFormat = (typeof HOCKEY_FORMATS)[number];
export const hockeyFormatSchema = z.enum(HOCKEY_FORMATS);

export const SKI_EQUIPMENT_TYPES = [
  'skis',
  'boots',
  'bindings',
  'poles',
  'helmet',
  'goggles',
  'jacket',
  'pants',
  'gloves',
  'bag',
  'other',
] as const;
export type SkiEquipmentType = (typeof SKI_EQUIPMENT_TYPES)[number];
export const skiEquipmentTypeSchema = z.enum(SKI_EQUIPMENT_TYPES);

export const HOCKEY_EQUIPMENT_TYPES = [
  'stick',
  'skates',
  'helmet',
  'gloves',
  'shoulder_pads',
  'elbow_pads',
  'shin_guards',
  'pants',
  'jersey',
  'bag',
  'goalie_gear',
  'other',
] as const;
export type HockeyEquipmentType = (typeof HOCKEY_EQUIPMENT_TYPES)[number];
export const hockeyEquipmentTypeSchema = z.enum(HOCKEY_EQUIPMENT_TYPES);

export const HOCKEY_POSITIONS = ['forward', 'defense', 'goalie', 'any'] as const;
export type HockeyPosition = (typeof HOCKEY_POSITIONS)[number];
export const hockeyPositionSchema = z.enum(HOCKEY_POSITIONS);

export const HANDEDNESSES = ['left', 'right'] as const;
export type Handedness = (typeof HANDEDNESSES)[number];
export const handednessSchema = z.enum(HANDEDNESSES);

export const GENDERS = ['men', 'women', 'unisex', 'youth'] as const;
export type Gender = (typeof GENDERS)[number];
export const genderSchema = z.enum(GENDERS);

export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export const skillLevelSchema = z.enum(SKILL_LEVELS);

export const SKI_LISTING_REQUIRED_DETAIL_FIELDS = ['sport'] as const;
export const SKI_LISTING_OPTIONAL_DETAIL_FIELDS = [
  'brand',
  'model',
  'year',
  'size',
  'gender',
  'skillLevel',
  'notes',
  'equipmentType',
  'discipline',
  'lengthCm',
  'waistWidthMm',
  'radiusM',
  'bootMondopointMm',
  'bootFlex',
  'bindingIncluded',
] as const;

export const HOCKEY_LISTING_REQUIRED_DETAIL_FIELDS = ['sport'] as const;
export const HOCKEY_LISTING_OPTIONAL_DETAIL_FIELDS = [
  'brand',
  'model',
  'year',
  'size',
  'gender',
  'skillLevel',
  'notes',
  'equipmentType',
  'format',
  'position',
  'handedness',
  'stickFlex',
  'stickLengthCm',
  'curve',
  'kickPoint',
  'skateSize',
  'skateWidth',
] as const;

export type SkiListingRequiredDetailField =
  (typeof SKI_LISTING_REQUIRED_DETAIL_FIELDS)[number];
export type SkiListingOptionalDetailField =
  (typeof SKI_LISTING_OPTIONAL_DETAIL_FIELDS)[number];
export type HockeyListingRequiredDetailField =
  (typeof HOCKEY_LISTING_REQUIRED_DETAIL_FIELDS)[number];
export type HockeyListingOptionalDetailField =
  (typeof HOCKEY_LISTING_OPTIONAL_DETAIL_FIELDS)[number];

/** UI-safe field discovery without guessing JSON keys. */
export const LISTING_DETAIL_FIELDS_BY_SPORT = {
  ski: {
    required: SKI_LISTING_REQUIRED_DETAIL_FIELDS,
    optional: SKI_LISTING_OPTIONAL_DETAIL_FIELDS,
  },
  hockey: {
    required: HOCKEY_LISTING_REQUIRED_DETAIL_FIELDS,
    optional: HOCKEY_LISTING_OPTIONAL_DETAIL_FIELDS,
  },
} as const satisfies Record<
  Sport,
  { required: readonly string[]; optional: readonly string[] }
>;

const optionalTrimmedText = z.string().trim().min(1).max(120).optional();
const optionalYear = z.number().int().min(1900).max(2200).optional();
const optionalSize = z.string().trim().min(1).max(40).optional();

const listingDetailBaseFields = {
  brand: optionalTrimmedText,
  model: optionalTrimmedText,
  year: optionalYear,
  size: optionalSize,
  gender: genderSchema.optional(),
  skillLevel: skillLevelSchema.optional(),
  notes: z.string().trim().min(1).max(1_000).optional(),
};

/**
 * `sport` is required in validated output. The default keeps the existing
 * mobile create payload valid while giving repositories a canonical discriminator.
 */
export const skiListingDetailsSchema = z
  .object({
    ...listingDetailBaseFields,
    sport: z.literal('ski').default('ski'),
    equipmentType: skiEquipmentTypeSchema.optional(),
    discipline: skiDisciplineSchema.optional(),
    lengthCm: z.number().finite().positive().max(300).optional(),
    waistWidthMm: z.number().finite().positive().max(200).optional(),
    radiusM: z.number().finite().positive().max(100).optional(),
    bootMondopointMm: z.number().int().min(100).max(400).optional(),
    bootFlex: z.number().int().positive().max(200).optional(),
    bindingIncluded: z.boolean().optional(),
  })
  .strict();

export type SkiListingDetails = z.infer<typeof skiListingDetailsSchema>;

export const hockeyListingDetailsSchema = z
  .object({
    ...listingDetailBaseFields,
    sport: z.literal('hockey').default('hockey'),
    equipmentType: hockeyEquipmentTypeSchema.optional(),
    format: hockeyFormatSchema.optional(),
    position: hockeyPositionSchema.optional(),
    handedness: handednessSchema.optional(),
    stickFlex: z.number().int().positive().max(200).optional(),
    stickLengthCm: z.number().finite().positive().max(250).optional(),
    curve: z.string().trim().min(1).max(80).optional(),
    kickPoint: z.string().trim().min(1).max(80).optional(),
    skateSize: z.number().finite().positive().max(20).optional(),
    skateWidth: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

export type HockeyListingDetails = z.infer<typeof hockeyListingDetailsSchema>;

export type SportListingDetails = SkiListingDetails | HockeyListingDetails;

export const listingDetailsSchemaBySport = {
  ski: skiListingDetailsSchema,
  hockey: hockeyListingDetailsSchema,
} satisfies Record<Sport, z.ZodTypeAny>;

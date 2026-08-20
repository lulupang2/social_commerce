import { z } from 'zod';

export const SPORTS = ['surf', 'tennis'] as const;
export type Sport = (typeof SPORTS)[number];
export const sportSchema = z.enum(SPORTS);

export const SPORT_LABELS: Record<Sport, string> = {
  surf: '서핑',
  tennis: '테니스',
};

export const SURF_DISCIPLINES = [
  'shortboard',
  'longboard',
  'funboard',
  'fish',
  'sup',
  'bodyboard',
  'foil',
  'other',
] as const;
export type SurfDiscipline = (typeof SURF_DISCIPLINES)[number];
export const surfDisciplineSchema = z.enum(SURF_DISCIPLINES);

export const SURF_EQUIPMENT_TYPES = [
  'surfboard',
  'wetsuit',
  'fins',
  'leash',
  'boardbag',
  'wax_accessories',
  'other',
] as const;
export type SurfEquipmentType = (typeof SURF_EQUIPMENT_TYPES)[number];
export const surfEquipmentTypeSchema = z.enum(SURF_EQUIPMENT_TYPES);

export const FIN_SYSTEMS = ['fcs', 'fcs2', 'futures', 'single_box', 'other'] as const;
export type FinSystem = (typeof FIN_SYSTEMS)[number];
export const finSystemSchema = z.enum(FIN_SYSTEMS);

export const WETSUIT_THICKNESSES = ['2mm', '3_2mm', '4_3mm', '5_4mm', 'other'] as const;
export type WetsuitThickness = (typeof WETSUIT_THICKNESSES)[number];
export const wetsuitThicknessSchema = z.enum(WETSUIT_THICKNESSES);

export const TENNIS_EQUIPMENT_TYPES = [
  'racket',
  'bag',
  'shoes',
  'apparel',
  'balls',
  'strings_grips',
  'other',
] as const;
export type TennisEquipmentType = (typeof TENNIS_EQUIPMENT_TYPES)[number];
export const tennisEquipmentTypeSchema = z.enum(TENNIS_EQUIPMENT_TYPES);

export const TENNIS_PLAY_STYLES = [
  'baseline_aggressive',
  'all_court',
  'serve_volley',
  'recreational',
  'other',
] as const;
export type TennisPlayStyle = (typeof TENNIS_PLAY_STYLES)[number];
export const tennisPlayStyleSchema = z.enum(TENNIS_PLAY_STYLES);

export const HANDEDNESSES = ['left', 'right'] as const;
export type Handedness = (typeof HANDEDNESSES)[number];
export const handednessSchema = z.enum(HANDEDNESSES);

export const GENDERS = ['men', 'women', 'unisex', 'youth'] as const;
export type Gender = (typeof GENDERS)[number];
export const genderSchema = z.enum(GENDERS);

export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export const skillLevelSchema = z.enum(SKILL_LEVELS);

export const SURF_LISTING_REQUIRED_DETAIL_FIELDS = ['sport'] as const;
export const SURF_LISTING_OPTIONAL_DETAIL_FIELDS = [
  'brand',
  'model',
  'year',
  'size',
  'gender',
  'skillLevel',
  'notes',
  'equipmentType',
  'discipline',
  'boardLengthFeet',
  'boardLengthCm',
  'volumeLiters',
  'finSystem',
  'finIncluded',
  'wetsuitThickness',
] as const;

export const TENNIS_LISTING_REQUIRED_DETAIL_FIELDS = ['sport'] as const;
export const TENNIS_LISTING_OPTIONAL_DETAIL_FIELDS = [
  'brand',
  'model',
  'year',
  'size',
  'gender',
  'skillLevel',
  'notes',
  'equipmentType',
  'playStyle',
  'handedness',
  'headSizeSqIn',
  'weightGrams',
  'gripSize',
  'stringPattern',
  'strung',
] as const;

export type SurfListingRequiredDetailField =
  (typeof SURF_LISTING_REQUIRED_DETAIL_FIELDS)[number];
export type SurfListingOptionalDetailField =
  (typeof SURF_LISTING_OPTIONAL_DETAIL_FIELDS)[number];
export type TennisListingRequiredDetailField =
  (typeof TENNIS_LISTING_REQUIRED_DETAIL_FIELDS)[number];
export type TennisListingOptionalDetailField =
  (typeof TENNIS_LISTING_OPTIONAL_DETAIL_FIELDS)[number];

/** UI-safe field discovery without guessing JSON keys. */
export const LISTING_DETAIL_FIELDS_BY_SPORT = {
  surf: {
    required: SURF_LISTING_REQUIRED_DETAIL_FIELDS,
    optional: SURF_LISTING_OPTIONAL_DETAIL_FIELDS,
  },
  tennis: {
    required: TENNIS_LISTING_REQUIRED_DETAIL_FIELDS,
    optional: TENNIS_LISTING_OPTIONAL_DETAIL_FIELDS,
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

export const surfListingDetailsSchema = z
  .object({
    ...listingDetailBaseFields,
    sport: z.literal('surf').default('surf'),
    equipmentType: surfEquipmentTypeSchema.optional(),
    discipline: surfDisciplineSchema.optional(),
    boardLengthFeet: z.number().finite().positive().max(20).optional(),
    boardLengthCm: z.number().finite().positive().max(600).optional(),
    volumeLiters: z.number().finite().positive().max(300).optional(),
    finSystem: finSystemSchema.optional(),
    finIncluded: z.boolean().optional(),
    wetsuitThickness: wetsuitThicknessSchema.optional(),
  })
  .strict();

export type SurfListingDetails = z.infer<typeof surfListingDetailsSchema>;

export const tennisListingDetailsSchema = z
  .object({
    ...listingDetailBaseFields,
    sport: z.literal('tennis').default('tennis'),
    equipmentType: tennisEquipmentTypeSchema.optional(),
    playStyle: tennisPlayStyleSchema.optional(),
    handedness: handednessSchema.optional(),
    headSizeSqIn: z.number().finite().positive().max(150).optional(),
    weightGrams: z.number().finite().positive().max(600).optional(),
    gripSize: z.string().trim().min(1).max(20).optional(),
    stringPattern: z.string().trim().min(1).max(20).optional(),
    strung: z.boolean().optional(),
  })
  .strict();

export type TennisListingDetails = z.infer<typeof tennisListingDetailsSchema>;

export type SportListingDetails = SurfListingDetails | TennisListingDetails;

export const listingDetailsSchemaBySport = {
  surf: surfListingDetailsSchema,
  tennis: tennisListingDetailsSchema,
} satisfies Record<Sport, z.ZodTypeAny>;

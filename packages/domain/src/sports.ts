import { z } from 'zod';

/** The sports currently supported by the marketplace and community. */
export const SPORTS = ['ski', 'hockey'] as const;
export type Sport = (typeof SPORTS)[number];
export type SportType = Sport;

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

export const GENDERS = ['men', 'women', 'unisex', 'youth'] as const;
export type Gender = (typeof GENDERS)[number];
export const genderSchema = z.enum(GENDERS);

export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export const skillLevelSchema = z.enum(SKILL_LEVELS);

/** Shared base properties for a sport-specific listing detail record. */
export interface ListingDetailBase {
  brand?: string;
  model?: string;
  year?: number;
  size?: string;
  gender?: Gender;
  notes?: string;
}

export interface SkiListingDetails extends ListingDetailBase {
  /** Optional because sport is already the discriminator on a listing. */
  sport?: 'ski';
  equipmentType?: SkiEquipmentType;
  discipline?: SkiDiscipline;
  lengthCm?: number;
  waistWidthMm?: number;
  radiusM?: number;
  bootSizeMondopoint?: number;
  bootFlex?: number;
  bindingIncluded?: boolean;
}

export interface HockeyListingDetails extends ListingDetailBase {
  /** Optional because sport is already the discriminator on a listing. */
  sport?: 'hockey';
  equipmentType?: HockeyEquipmentType;
  format?: HockeyFormat;
  position?: HockeyPosition;
  handedness?: 'left' | 'right';
  stickFlex?: number;
  stickLengthCm?: number;
  curve?: string;
  kickPoint?: string;
  skateSize?: number;
  skateWidth?: string;
}

export type SportListingDetails = SkiListingDetails | HockeyListingDetails;
export type SkiListingDetail = SkiListingDetails;
export type HockeyListingDetail = HockeyListingDetails;

const optionalTrimmedText = z.string().trim().min(1).max(120).optional();
const optionalYear = z.number().int().min(1900).max(2200).optional();
const optionalSize = z.string().trim().min(1).max(40).optional();

export const skiListingDetailsSchema = z
  .object({
    sport: z.literal('ski').optional(),
    brand: optionalTrimmedText,
    model: optionalTrimmedText,
    year: optionalYear,
    size: optionalSize,
    gender: genderSchema.optional(),
    notes: z.string().trim().max(1000).optional(),
    equipmentType: skiEquipmentTypeSchema.optional(),
    discipline: skiDisciplineSchema.optional(),
    lengthCm: z.number().positive().max(300).optional(),
    waistWidthMm: z.number().positive().max(200).optional(),
    radiusM: z.number().positive().max(100).optional(),
    bootSizeMondopoint: z.number().positive().max(40).optional(),
    bootFlex: z.number().int().positive().max(200).optional(),
    bindingIncluded: z.boolean().optional(),
  })
  .passthrough();

export const hockeyListingDetailsSchema = z
  .object({
    sport: z.literal('hockey').optional(),
    brand: optionalTrimmedText,
    model: optionalTrimmedText,
    year: optionalYear,
    size: optionalSize,
    gender: genderSchema.optional(),
    notes: z.string().trim().max(1000).optional(),
    equipmentType: hockeyEquipmentTypeSchema.optional(),
    format: hockeyFormatSchema.optional(),
    position: hockeyPositionSchema.optional(),
    handedness: z.enum(['left', 'right']).optional(),
    stickFlex: z.number().positive().max(200).optional(),
    stickLengthCm: z.number().positive().max(250).optional(),
    curve: z.string().trim().max(80).optional(),
    kickPoint: z.string().trim().max(80).optional(),
    skateSize: z.number().positive().max(20).optional(),
    skateWidth: z.string().trim().max(20).optional(),
  })
  .passthrough();

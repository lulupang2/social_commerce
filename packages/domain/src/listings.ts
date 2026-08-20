import { z } from 'zod';

import {
  httpsUrlSchema,
  isoTimestampSchema,
  nonEmptyTrimmedTextSchema,
  uuidSchema,
} from './common.js';
import {
  surfListingDetailsSchema,
  tennisListingDetailsSchema,
} from './sports.js';

export const LISTING_CATEGORIES = [
  'equipment',
  'apparel',
  'footwear',
  'protective',
  'accessories',
  'other',
] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];
export const listingCategorySchema = z.enum(LISTING_CATEGORIES);

export const LISTING_STATUSES = [
  'draft',
  'pending_review',
  'active',
  'reserved',
  'sold',
  'archived',
  'rejected',
  'removed',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const listingStatusSchema = z.enum(LISTING_STATUSES);

export const LISTING_CONDITIONS = ['new', 'like_new', 'good', 'fair', 'poor'] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number];
export const listingConditionSchema = z.enum(LISTING_CONDITIONS);

export const CURRENCY_CODES = ['USD', 'CAD', 'EUR', 'GBP', 'JPY', 'KRW'] as const;
export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Currency must be a three-letter ISO code');
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

export const moneySchema = z
  .object({
    amount: z.number().finite().nonnegative(),
    currency: currencyCodeSchema,
  })
  .strict();
export type Money = z.infer<typeof moneySchema>;

export const listingPriceInputSchema = z.union([z.number().finite().nonnegative(), moneySchema]);
export type ListingPriceInput = z.input<typeof listingPriceInputSchema>;

export const locationObjectSchema = z
  .object({
    city: nonEmptyTrimmedTextSchema.max(80).optional(),
    region: nonEmptyTrimmedTextSchema.max(80).optional(),
    country: nonEmptyTrimmedTextSchema.max(80).optional(),
    postalCode: nonEmptyTrimmedTextSchema.max(20).optional(),
    latitude: z.number().finite().min(-90).max(90).optional(),
    longitude: z.number().finite().min(-180).max(180).optional(),
    raw: nonEmptyTrimmedTextSchema.max(160).optional(),
  })
  .strict();

export type Location = z.infer<typeof locationObjectSchema>;

export const locationSchema = z.union([nonEmptyTrimmedTextSchema.max(120), locationObjectSchema]);
export type LocationInput = z.input<typeof locationSchema>;

/** Existing mobile/web public image shape; signed lifecycle is modeled in media.ts. */
export const listingImageSchema = z
  .object({
    url: httpsUrlSchema,
    position: z.number().int().min(0).max(20),
    isPrimary: z.boolean().default(false),
    expiresAt: isoTimestampSchema.optional(),
  })
  .strict();
export type ListingImage = z.infer<typeof listingImageSchema>;

export const listingImageInputSchema = z.union([
  httpsUrlSchema,
  listingImageSchema.omit({ expiresAt: true }),
]);
export type ListingImageInput = z.input<typeof listingImageInputSchema>;

const listingCoreFields = {
  id: uuidSchema,
  sellerId: uuidSchema,
  category: listingCategorySchema,
  status: listingStatusSchema,
  condition: listingConditionSchema,
  title: nonEmptyTrimmedTextSchema.max(160),
  description: z.string().trim().max(10_000),
  price: moneySchema,
  images: z.array(listingImageSchema).max(12),
  location: locationSchema.optional(),
  tags: z.array(nonEmptyTrimmedTextSchema.max(40)).max(20).optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
};

export const surfListingSchema = z
  .object({
    ...listingCoreFields,
    sport: z.literal('surf'),
    details: surfListingDetailsSchema,
  })
  .strict();
export type SurfListing = z.infer<typeof surfListingSchema>;

export const tennisListingSchema = z
  .object({
    ...listingCoreFields,
    sport: z.literal('tennis'),
    details: tennisListingDetailsSchema,
  })
  .strict();
export type TennisListing = z.infer<typeof tennisListingSchema>;

export const listingSchema = z.discriminatedUnion('sport', [
  surfListingSchema,
  tennisListingSchema,
]);
export type Listing = z.infer<typeof listingSchema>;

const commonCreateListingSchema = z
  .object({
    title: nonEmptyTrimmedTextSchema.max(120),
    description: nonEmptyTrimmedTextSchema.max(5_000),
    category: listingCategorySchema,
    condition: listingConditionSchema,
    price: listingPriceInputSchema,
    currency: currencyCodeSchema.optional(),
    images: z.array(listingImageInputSchema).max(12).optional(),
    location: locationSchema.optional(),
    tags: z.array(nonEmptyTrimmedTextSchema.max(40)).max(20).optional(),
    isNegotiable: z.boolean().optional(),
    shippingAvailable: z.boolean().optional(),
    localPickupAvailable: z.boolean().optional(),
  })
  .strict();

export const createListingSchema = z.discriminatedUnion('sport', [
  commonCreateListingSchema.extend({
    sport: z.literal('surf'),
    details: surfListingDetailsSchema,
  }),
  commonCreateListingSchema.extend({
    sport: z.literal('tennis'),
    details: tennisListingDetailsSchema,
  }),
]);

export type CreateListingPayload = z.input<typeof createListingSchema>;
export type CreateListing = z.output<typeof createListingSchema>;

import { z } from 'zod';
import {
  hockeyListingDetailsSchema,
  type HockeyListingDetails,
  skiListingDetailsSchema,
  type SkiListingDetails,
  sportSchema,
  type Sport,
  type SportListingDetails,
} from './sports.js';

export const LISTING_CATEGORIES = [
  'equipment',
  'apparel',
  'protective_gear',
  'accessories',
  'parts',
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
  'removed',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const listingStatusSchema = z.enum(LISTING_STATUSES);

export const LISTING_CONDITIONS = ['new', 'like_new', 'good', 'fair', 'poor'] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number];
export type Condition = ListingCondition;
export const listingConditionSchema = z.enum(LISTING_CONDITIONS);

export const CURRENCY_CODES = ['USD', 'CAD', 'EUR', 'GBP', 'JPY', 'KRW'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number] | (string & {});

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export type ListingPriceInput = number | Money;

export interface Location {
  city?: string;
  region?: string;
  countryCode?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export type LocationInput = string | Location;

export interface ListingImage {
  url: string;
  altText?: string;
  sortOrder?: number;
}

export interface ListingCore {
  id: string;
  sellerId: string;
  sport: Sport;
  category: ListingCategory;
  status: ListingStatus;
  condition: ListingCondition;
  title: string;
  description: string;
  price: Money;
  images: ListingImage[];
  location?: LocationInput;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SkiListing extends Omit<ListingCore, 'sport'> {
  sport: 'ski';
  details: SkiListingDetails;
}

export interface HockeyListing extends Omit<ListingCore, 'sport'> {
  sport: 'hockey';
  details: HockeyListingDetails;
}

export type Listing = SkiListing | HockeyListing;
export type ListingDetails = SportListingDetails;

const trimmedText = z.string().trim().min(1);
const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Currency must be a three-letter ISO code');

export const moneySchema = z.object({
  amount: z.number().finite().nonnegative(),
  currency: currencyCodeSchema,
});

export const listingPriceInputSchema = z.union([z.number().finite().nonnegative(), moneySchema]);

export const locationSchema = z.union([
  trimmedText.max(120),
  z
    .object({
      city: z.string().trim().min(1).max(100).optional(),
      region: z.string().trim().min(1).max(100).optional(),
      countryCode: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/)
        .optional(),
      postalCode: z.string().trim().max(20).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
    })
    .passthrough(),
]);

const listingImageSchema = z.union([
  z.string().url(),
  z
    .object({
      url: z.string().url(),
      altText: z.string().trim().max(160).optional(),
      sortOrder: z.number().int().nonnegative().optional(),
    })
    .passthrough(),
]);

const commonCreateListingSchema = z
  .object({
    title: trimmedText.max(120),
    description: trimmedText.max(5000),
    category: listingCategorySchema,
    condition: listingConditionSchema,
    price: listingPriceInputSchema,
    currency: currencyCodeSchema.optional(),
    images: z.array(listingImageSchema).max(12).optional(),
    location: locationSchema.optional(),
    tags: z.array(trimmedText.max(40)).max(20).optional(),
    isNegotiable: z.boolean().optional(),
    shippingAvailable: z.boolean().optional(),
    localPickupAvailable: z.boolean().optional(),
  })
  .passthrough();

/**
 * Input accepted by both clients when creating a listing. The sport discriminator
 * keeps ski and hockey detail fields type-safe without coupling the package to a UI.
 */
export const createListingSchema = z.discriminatedUnion('sport', [
  commonCreateListingSchema.extend({
    sport: z.literal('ski'),
    details: skiListingDetailsSchema,
  }),
  commonCreateListingSchema.extend({
    sport: z.literal('hockey'),
    details: hockeyListingDetailsSchema,
  }),
]);

export type CreateListingInput = z.input<typeof createListingSchema>;
export type CreateListing = z.infer<typeof createListingSchema>;
export type CreateListingPayload = CreateListingInput;

/** A small schema useful to clients that only need to validate a sport field. */
export const listingSportSchema = sportSchema;

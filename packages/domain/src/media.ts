import { z } from 'zod';

import { httpsUrlSchema, isoTimestampSchema, uuidSchema } from './common.js';

export const LISTING_MEDIA_MAX_TTL_SECONDS = 10 * 60;

export const LISTING_MEDIA_UNAVAILABLE_REASONS = [
  'not_found',
  'forbidden',
  'expired',
  'signing_failed',
] as const;
export type ListingMediaUnavailableReason = (typeof LISTING_MEDIA_UNAVAILABLE_REASONS)[number];
export const listingMediaUnavailableReasonSchema = z.enum(LISTING_MEDIA_UNAVAILABLE_REASONS);

const mediaBaseFields = {
  id: uuidSchema,
  altText: z.string().trim().min(1).max(160).optional(),
  sortOrder: z.number().int().nonnegative(),
};

export const signedListingMediaSchema = z
  .object({
    ...mediaBaseFields,
    state: z.literal('signed'),
    url: httpsUrlSchema,
    expiresAt: isoTimestampSchema,
  })
  .strict();

export type SignedListingMedia = z.infer<typeof signedListingMediaSchema>;

export const unavailableListingMediaSchema = z
  .object({
    ...mediaBaseFields,
    state: z.literal('unavailable'),
    reason: listingMediaUnavailableReasonSchema,
  })
  .strict();

export type UnavailableListingMedia = z.infer<typeof unavailableListingMediaSchema>;

export const listingMediaStateSchema = z.discriminatedUnion('state', [
  signedListingMediaSchema,
  unavailableListingMediaSchema,
]);

export type ListingMediaState = z.infer<typeof listingMediaStateSchema>;

export const listingMediaCollectionSchema = z
  .array(listingMediaStateSchema)
  .max(12)
  .superRefine((items, context) => {
    const ids = new Set<string>();
    const sortOrders = new Set<number>();

    items.forEach((item, index) => {
      if (ids.has(item.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'id'],
          message: 'Media IDs must be unique',
        });
      }
      ids.add(item.id);

      if (sortOrders.has(item.sortOrder)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'sortOrder'],
          message: 'Media sort orders must be unique',
        });
      }
      sortOrders.add(item.sortOrder);
    });
  });

export type ListingMediaCollection = z.infer<typeof listingMediaCollectionSchema>;

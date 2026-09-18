import { z } from 'zod';

import { isoTimestampSchema, uuidSchema } from './common.js';

export const APP_ROLES = ['user', 'moderator', 'admin'] as const;
export type AppRole = (typeof APP_ROLES)[number];
export const appRoleSchema = z.enum(APP_ROLES);

export const PUBLICATION_ROLES = ['moderator', 'admin'] as const;
export type PublicationRole = (typeof PUBLICATION_ROLES)[number];
export const publicationRoleSchema = z.enum(PUBLICATION_ROLES);

export const LISTING_PUBLICATION_STATES = [
  'draft',
  'pending_review',
  'rejected',
  'active',
  'archived',
  'removed',
] as const;
export type ListingPublicationState = (typeof LISTING_PUBLICATION_STATES)[number];
export const listingPublicationStateSchema = z.enum(LISTING_PUBLICATION_STATES);

export const COMMUNITY_POST_STATUSES = ['draft', 'active', 'hidden', 'deleted'] as const;
export type CommunityPostStatus = (typeof COMMUNITY_POST_STATUSES)[number];
export const communityPostStatusSchema = z.enum(COMMUNITY_POST_STATUSES);

export const LISTING_PUBLICATION_TRANSITIONS = {
  user: {
    draft: ['pending_review'],
    rejected: ['draft'],
  },
  moderator: {
    pending_review: ['active', 'rejected', 'archived', 'removed'],
    rejected: ['draft', 'removed'],
    active: ['archived', 'removed'],
    archived: ['active', 'removed'],
  },
  admin: {
    pending_review: ['active', 'rejected', 'archived', 'removed'],
    rejected: ['draft', 'removed'],
    active: ['archived', 'removed'],
    archived: ['active', 'removed'],
  },
} as const;

export const COMMUNITY_PUBLICATION_TRANSITIONS = {
  user: {},
  moderator: {
    draft: ['active', 'deleted'],
    active: ['hidden', 'deleted'],
    hidden: ['active', 'deleted'],
  },
  admin: {
    draft: ['active', 'deleted'],
    active: ['hidden', 'deleted'],
    hidden: ['active', 'deleted'],
  },
} as const;

function includesTransition(
  transitions: Record<string, Record<string, readonly string[]>>,
  actorRole: AppRole,
  from: string,
  to: string,
): boolean {
  return transitions[actorRole]?.[from]?.includes(to) ?? false;
}

export const listingPublicationTransitionSchema = z
  .object({
    actorRole: appRoleSchema,
    from: listingPublicationStateSchema,
    to: listingPublicationStateSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !includesTransition(LISTING_PUBLICATION_TRANSITIONS, value.actorRole, value.from, value.to)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: `${value.actorRole} cannot publish listing ${value.from} -> ${value.to}`,
      });
    }
  });

export type ListingPublicationTransition = z.infer<typeof listingPublicationTransitionSchema>;

export const communityPublicationTransitionSchema = z
  .object({
    actorRole: appRoleSchema,
    from: communityPostStatusSchema,
    to: communityPostStatusSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !includesTransition(COMMUNITY_PUBLICATION_TRANSITIONS, value.actorRole, value.from, value.to)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: `${value.actorRole} cannot publish community post ${value.from} -> ${value.to}`,
      });
    }
  });

export type CommunityPublicationTransition = z.infer<typeof communityPublicationTransitionSchema>;

export const publicationAuditEventSchema = z
  .object({
    id: uuidSchema,
    actorId: uuidSchema,
    actorRole: publicationRoleSchema,
    targetId: uuidSchema,
    targetType: z.enum(['listing', 'community_post']),
    action: z.enum(['publish', 'reject', 'archive', 'hide', 'remove', 'restore']),
    fromStatus: z.string().trim().min(1).max(40),
    toStatus: z.string().trim().min(1).max(40),
    occurredAt: isoTimestampSchema,
  })
  .strict();

export type PublicationAuditEvent = z.infer<typeof publicationAuditEventSchema>;

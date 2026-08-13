import type { Location, Money } from './listings.js';
import type { Sport } from './sports.js';

export const SELLER_TYPES = ['individual', 'shop', 'brand'] as const;
export type SellerType = (typeof SELLER_TYPES)[number];
export type SellerAccountType = SellerType;

export interface Seller {
  id: string;
  displayName: string;
  username?: string;
  accountType: SellerType;
  avatarUrl?: string;
  bio?: string;
  location?: Location;
  sports?: Sport[];
  rating?: number;
  ratingCount?: number;
  verified?: boolean;
  createdAt: string;
}

export type SellerProfile = Seller;

export const TRANSACTION_STATUSES = [
  'pending',
  'accepted',
  'payment_pending',
  'paid',
  'fulfilling',
  'shipped',
  'completed',
  'cancelled',
  'disputed',
  'refunded',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const FULFILLMENT_STATUSES = [
  'not_started',
  'pickup_scheduled',
  'ready_for_pickup',
  'shipped',
  'delivered',
  'complete',
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['card', 'cash', 'bank_transfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Transaction {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: Money;
  status: TransactionStatus;
  fulfillmentStatus?: FulfillmentStatus;
  paymentMethod?: PaymentMethod;
  shippingAddress?: Location;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type MarketplaceTransaction = Transaction;

export const COMMUNITY_POST_TYPES = [
  'discussion',
  'question',
  'guide',
  'review',
  'event',
  'announcement',
] as const;
export type CommunityPostType = (typeof COMMUNITY_POST_TYPES)[number];
export type CommunityPostKind = CommunityPostType;

export interface CommunityPost {
  id: string;
  authorId: string;
  sport?: Sport;
  type: CommunityPostType;
  title: string;
  body: string;
  tags?: string[];
  commentCount?: number;
  reactionCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityComment {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CommunityReaction {
  postId: string;
  userId: string;
  kind: 'like' | 'helpful' | 'celebrate';
  createdAt: string;
}

export const REPORT_TARGET_TYPES = ['listing', 'profile', 'post', 'comment', 'message'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  'spam',
  'scam',
  'counterfeit',
  'prohibited_item',
  'harassment',
  'hate_speech',
  'unsafe_meetup',
  'copyright',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = [
  'pending',
  'open',
  'under_review',
  'resolved',
  'dismissed',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface Report {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

// Generated from apps/api/openapi.yaml. Do not edit by hand.
// Regenerate: node ops/nhn-rocky/generate-auth-types.mjs

export type ChatMessage = {
  "id": string;
  "conversationId": string;
  "senderId": string;
  "body": string;
  "readAt": string | null;
  "createdAt": string;
};

export type Conversation = {
  "id": string;
  "currentUserId": string;
  "otherUserName": string;
  "listing": (null) | ({
  "id": string;
  "title": string;
  "price": number;
});
  "messages": Array<ChatMessage>;
};

export type ConversationList = {
  "items": Array<{
  "id": string;
  "listingId": string;
  "listingTitle": string;
  "listingPrice": number | null;
  "otherUserName": string;
  "lastMessage": string;
  "lastMessageTime": string | null;
  "unreadCount": number;
}>;
};

export type CommunityPostInput = {
  "sport": "surf" | "tennis";
  "type": "guide" | "review" | "meetup" | "discussion";
  "title": string;
  "body": string;
};

export type CommunityPost = {
  "id": string;
  "authorId": string;
  "authorName": string;
  "sport": "surf" | "tennis";
  "type": "guide" | "review" | "meetup" | "discussion";
  "title": string;
  "body": string;
  "status": "pending_review" | "rejected" | "active";
  "reason": string | null;
  "likes": number;
  "liked": boolean;
  "comments": number;
  "publishedAt": string | null;
  "createdAt": string;
  "updatedAt": string;
};

export type CommunityPostList = {
  "items": Array<CommunityPost>;
};

export type CommunityComment = {
  "id": string;
  "postId": string;
  "authorId": string;
  "author": string;
  "body": string;
  "createdAt": string;
};

export type CommunityCommentList = {
  "items": Array<CommunityComment>;
};

export type CommunityReaction = {
  "liked": boolean;
  "likes": number;
};

export type Error = {
  "code": string;
  "message": string;
  "requestId": string;
};

export type HealthLive = {
  "status": "ok";
};

export type HealthReady = {
  "status": "ready";
};

export type ProviderStatus = {
  "provider": "naver" | "kakao";
  "enabled": boolean;
  "missing": Array<string>;
};

export type ProvidersResponse = {
  "providers": Array<ProviderStatus>;
};

export type Member = {
  "id": string;
  "displayName": string | null;
  "email": string | null;
  "onboarded": boolean;
};

export type SessionInfo = {
  "expiresAt": string;
  "absoluteExpiresAt": string;
  "reauthenticatedAt": string | null;
};

export type SessionView = {
  "member": Member;
  "csrfToken": string;
  "session": SessionInfo;
};

export type ReauthenticateRequest = {
  "provider": "naver" | "kakao";
  "returnTo": string;
};

export type AuthorizationResponse = {
  "authorizationUrl": string;
};

export type ListingCategory = "equipment" | "apparel" | "footwear" | "protective" | "accessories" | "other";

export type ListingCondition = "new" | "like_new" | "good" | "fair" | "poor";

export type ReviewEvent = {
  "id": number;
  "listingId": string;
  "actorMemberId": string;
  "fromStatus": "pending_review" | "rejected";
  "toStatus": "active" | "rejected" | "pending_review";
  "reason": string | null;
  "createdAt": string;
};

export type ListingAvailability = {
  "purchasable": boolean;
  "reason": "available" | "not_public" | "not_prepared" | "sold_out";
};

export type ListingStatus = "draft" | "pending_review" | "rejected" | "active" | "reserved" | "sold" | "archived" | "removed";

export type ListingSeller = {
  "id": string;
  "displayName": string | null;
};

export type MemberProfileUpdate = {
  "displayName": string;
  "surfSkill": MemberSkill;
  "tennisSkill": MemberSkill;
  "preferredSport": "surf" | "tennis" | null;
  "maxBudgetKrw": number | null;
  "preferredRegion": string;
};

export type MemberSkill = "beginner" | "intermediate" | "advanced" | "expert";

export type MemberProfile = {
  "id": string;
  "displayName": string;
  "surfSkill": MemberSkill;
  "tennisSkill": MemberSkill;
  "preferredSport": "surf" | "tennis" | null;
  "maxBudgetKrw": number | null;
  "preferredRegion": string;
  "savedCount": number;
  "transactionCount": number;
};

export type RecommendationList = {
  "items": Array<{
  "listing": Listing;
  "reason": string | null;
  "score": number;
}>;
};

export type FavoriteResult = {
  "listingId": string;
  "favorite": boolean;
};

export type PersonalListings = {
  "items": Array<Listing>;
};

export type Listing = {
  "id": string;
  "seller": ListingSeller;
  "sport": "surf" | "tennis";
  "category": ListingCategory;
  "title": string;
  "description": string;
  "priceKrw": number;
  "condition": ListingCondition;
  "status": ListingStatus;
  "details": Record<string, unknown>;
  "location": string;
  "publishedAt": string | null;
  "createdAt": string;
  "updatedAt": string;
  "images": Array<SignedListingImage>;
};

export type ListingList = {
  "items": Array<Listing>;
  "nextCursor": string | null;
};

export type CreateListingRequest = {
  "sport": "surf" | "tennis";
  "category": ListingCategory;
  "title": string;
  "description": string;
  "priceKrw": number;
  "condition": ListingCondition;
  "details": Record<string, unknown>;
  "location": string;
};

export type UpdateListingRequest = {
  "category"?: ListingCategory;
  "title"?: string;
  "description"?: string;
  "priceKrw"?: number;
  "condition"?: ListingCondition;
  "details"?: Record<string, unknown>;
  "location"?: string;
};

export type ListingImageUploadRequest = {
  "mimeType": "image/jpeg" | "image/jpg" | "image/png" | "image/webp";
  "fileSizeBytes": number;
  "altText"?: string | null;
  "sortOrder"?: number | null;
  "replaceImageId"?: string | null;
};

export type ListingImageUploadSlot = {
  "imageId": string;
  "uploadUrl": string;
  "expiresAt": string;
};

export type SignedListingImage = {
  "id": string;
  "state": "signed";
  "url": string;
  "expiresAt": string;
  "altText"?: string;
  "sortOrder": number;
};

export type ListingImagesResponse = {
  "listingId": string;
  "images": Array<SignedListingImage>;
};

export type ListingImageCompleteResult = {
  "imageId": string;
  "state": "ready";
};

export type CreateOrderRequest = {
  "listingId": string;
  "quantity": 1;
};

export type OrderView = {
  "id": string;
  "buyerId": string;
  "sellerId": string;
  "listingId": string;
  "itemName": string;
  "unitPriceKrw": number;
  "quantity": 1;
  "shippingFeeKrw": number;
  "serviceFeeKrw": number;
  "totalAmountKrw": number;
  "currency": "KRW";
  "status": "pending" | "cancelled" | "confirmed";
  "paymentStatus": "unpaid" | "pending_approval" | "approved" | "failed" | "pending_cancel" | "cancelled";
  "items"?: Array<OrderItem>;
  "reservation"?: Reservation;
  "createdAt": string;
  "updatedAt": string;
};

export type OrderItem = {
  "id": string;
  "listingId": string;
  "itemName": string;
  "unitPriceKrw": number;
  "quantity": 1;
  "lineTotalKrw": number;
  "createdAt": string;
};

export type Reservation = {
  "id": string;
  "listingId": string;
  "orderId": string;
  "quantity": 1;
  "expiresAt": string;
  "state": "active" | "consumed" | "expired" | "released";
};

export type OrderListResponse = {
  "orders": Array<OrderView>;
};

export type CancelOrderResponse = {
  "order": OrderView;
};

export type ConfirmPaymentRequest = {
  "paymentKey": string;
  "amount": number;
};

// Generated from apps/api/openapi.yaml. Do not edit by hand.
// Regenerate: node ops/nhn-rocky/generate-auth-types.mjs

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

export type ListingStatus = "draft" | "pending_review" | "rejected" | "active" | "reserved" | "sold" | "archived" | "removed";

export type ListingSeller = {
  "id": string;
  "displayName": string | null;
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
};

export type ListingList = {
  "items": Array<Listing>;
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

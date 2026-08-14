export interface SignListingImagesRequest {
  listingId: string;
  imageIds?: string[];
}

export interface SignedImageItem {
  id: string;
  url: string;
  expiresAt: string;
  altText: string | null;
  sortOrder: number;
}

export interface SignListingImagesSuccessResponse {
  listingId: string;
  images: SignedImageItem[];
}

export type ErrorCode =
  | "invalid_request"
  | "authentication_required"
  | "not_found"
  | "dependency_unavailable";

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
  };
}

export interface ListingRecord {
  id: string;
  seller_id: string;
  status: string;
}

export interface ProfileRecord {
  id: string;
  role: string;
  is_banned: boolean;
}

export interface ListingImageRecord {
  id: string;
  storage_path: string;
  alt_text: string | null;
  sort_order: number;
}

export interface UserRecord {
  id: string;
  email?: string;
}

export interface Dependencies {
  getUserByToken?: (
    token: string
  ) => Promise<{ user: UserRecord | null; error: Error | null }>;
  getProfileById?: (
    userId: string
  ) => Promise<{ profile: ProfileRecord | null; error: Error | null }>;
  getListingById?: (
    listingId: string
  ) => Promise<{ listing: ListingRecord | null; error: Error | null }>;
  getListingImages?: (
    listingId: string,
    imageIds: string[] | null
  ) => Promise<{ images: ListingImageRecord[] | null; error: Error | null }>;
  createSignedUrl?: (
    path: string,
    expiresIn: number
  ) => Promise<{ signedUrl: string | null; error: Error | null }>;
  env?: {
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
  };
}

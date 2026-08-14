export type MediaErrorCode =
  | 'permission_denied'
  | 'selection_canceled'
  | 'invalid_mime'
  | 'size_exceeded'
  | 'invalid_dimensions'
  | 'invalid_path'
  | 'unauthenticated'
  | 'upload_failed'
  | 'signed_url_failed'
  | 'delete_failed'
  | 'db_persistence_failed';

export interface MediaError {
  code: MediaErrorCode;
  message: string;
  cause?: unknown;
}

export interface MediaValidationOptions {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
  maxWidth?: number;
  maxHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

export interface MediaAssetInput {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
}

export interface ValidatedMediaAsset {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  altText?: string | null;
}

export interface ProcessedMediaAsset {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  altText?: string | null;
}

export interface MediaUploadOptions {
  sellerId: string;
  listingId: string;
  altText?: string | null;
  sortOrder?: number;
  maxRetries?: number;
}

export interface MediaUploadResult {
  storagePath: string;
  altText?: string | null;
  sortOrder: number;
}

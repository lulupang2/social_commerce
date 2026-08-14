import type {
  MediaAssetInput,
  MediaError,
  MediaValidationOptions,
  ValidatedMediaAsset,
} from './types.ts';

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const DEFAULT_MAX_DIMENSION = 4096;
export const DEFAULT_MIN_DIMENSION = 1;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(str: string): boolean {
  return UUID_REGEX.test(str);
}

export function isValidMimeType(mimeType: string, allowed = ALLOWED_MIME_TYPES): boolean {
  if (!mimeType) return false;
  const normalized = mimeType.toLowerCase().trim();
  return allowed.includes(normalized);
}

export function isValidFileSize(size: number, maxBytes = MAX_FILE_SIZE_BYTES): boolean {
  return typeof size === 'number' && Number.isFinite(size) && size > 0 && size <= maxBytes;
}

export function isValidDimensions(
  width: number,
  height: number,
  options?: { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number },
): boolean {
  const minW = options?.minWidth ?? DEFAULT_MIN_DIMENSION;
  const minH = options?.minHeight ?? DEFAULT_MIN_DIMENSION;
  const maxW = options?.maxWidth ?? DEFAULT_MAX_DIMENSION;
  const maxH = options?.maxHeight ?? DEFAULT_MAX_DIMENSION;

  return (
    typeof width === 'number' &&
    Number.isFinite(width) &&
    width >= minW &&
    width <= maxW &&
    typeof height === 'number' &&
    Number.isFinite(height) &&
    height >= minH &&
    height <= maxH
  );
}

export function isValidListingImageObjectPath(objectName: string): boolean {
  if (!objectName || typeof objectName !== 'string') return false;

  const len = new TextEncoder().encode(objectName).length;
  if (len < 75 || len > 1024) return false;

  if (objectName.includes('\\')) return false;
  if (objectName.includes('//')) return false;
  if (/[\s?#%]/.test(objectName)) return false;
  if (/(^|\/)\.{1,2}(\/|$)/.test(objectName)) return false;
  if (objectName.endsWith('/')) return false;

  const parts = objectName.split('/');
  if (parts.length < 3) return false;

  const [sellerId, listingId] = parts;
  if (!isValidUuid(sellerId)) return false;
  if (!isValidUuid(listingId)) return false;

  const filename = parts.slice(2).join('/');
  if (!filename || filename.trim().length === 0) return false;

  return true;
}

export function formatListingImageStoragePath(
  sellerId: string,
  listingId: string,
  filename: string,
): string {
  const normalizedSellerId = sellerId.trim().toLowerCase();
  const normalizedListingId = listingId.trim().toLowerCase();

  if (!isValidUuid(normalizedSellerId)) {
    throw new Error(`Invalid sellerId UUID: ${sellerId}`);
  }
  if (!isValidUuid(normalizedListingId)) {
    throw new Error(`Invalid listingId UUID: ${listingId}`);
  }

  const cleanFilename = filename.replace(/[\s?#%\\/]+/g, '_').trim() || 'image.jpg';
  const path = `${normalizedSellerId}/${normalizedListingId}/${cleanFilename}`;

  if (!isValidListingImageObjectPath(path)) {
    throw new Error(`Formatted path is invalid: ${path}`);
  }

  return path;
}

export function validateMediaAsset(
  asset: MediaAssetInput,
  options?: MediaValidationOptions,
): { valid: true; asset: ValidatedMediaAsset } | { valid: false; error: MediaError } {
  const allowedMime = options?.allowedMimeTypes ?? ALLOWED_MIME_TYPES;
  const maxSizeBytes = options?.maxSizeBytes ?? MAX_FILE_SIZE_BYTES;

  const mimeType = asset.mimeType?.toLowerCase().trim() || 'image/jpeg';
  if (!isValidMimeType(mimeType, allowedMime)) {
    return {
      valid: false,
      error: {
        code: 'invalid_mime',
        message: `Unsupported image format (${mimeType}). Only JPEG, PNG, and WebP are allowed.`,
      },
    };
  }

  const fileSize = asset.fileSize ?? 0;
  if (fileSize > maxSizeBytes) {
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    const maxMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: {
        code: 'size_exceeded',
        message: `Image size (${sizeMB}MB) exceeds maximum allowed limit (${maxMB}MB).`,
      },
    };
  }

  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  if (
    width > 0 &&
    height > 0 &&
    !isValidDimensions(width, height, {
      minWidth: options?.minWidth,
      minHeight: options?.minHeight,
      maxWidth: options?.maxWidth,
      maxHeight: options?.maxHeight,
    })
  ) {
    return {
      valid: false,
      error: {
        code: 'invalid_dimensions',
        message: `Image dimensions (${width}x${height}) are out of acceptable bounds.`,
      },
    };
  }

  const fileName = asset.fileName?.trim() || `image_${Date.now()}.jpg`;

  return {
    valid: true,
    asset: {
      uri: asset.uri,
      fileName,
      mimeType,
      fileSize,
      width: width || 800,
      height: height || 800,
      altText: asset.altText ?? null,
    },
  };
}

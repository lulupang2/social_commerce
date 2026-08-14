import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  MediaError,
  MediaUploadOptions,
  MediaUploadResult,
  ProcessedMediaAsset,
} from './types.ts';
import { formatListingImageStoragePath, isValidListingImageObjectPath } from './validation.ts';

export const LISTING_IMAGE_BUCKET = 'listing-images';
export const DEFAULT_SIGNED_URL_EXPIRES_IN = 10 * 60; // 10 minutes (600s)

async function fetchAssetBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to fetch image binary from URI (${response.status})`);
  }
  return await response.arrayBuffer();
}

async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 300,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

export async function uploadSingleImage(
  client: SupabaseClient,
  asset: ProcessedMediaAsset,
  options: MediaUploadOptions,
): Promise<{ success: true; result: MediaUploadResult } | { success: false; error: MediaError }> {
  try {
    const filename = asset.fileName || `${Date.now()}.jpg`;
    const storagePath = formatListingImageStoragePath(
      options.sellerId,
      options.listingId,
      filename,
    );

    if (!isValidListingImageObjectPath(storagePath)) {
      return {
        success: false,
        error: {
          code: 'invalid_path',
          message: `Storage path (${storagePath}) fails namespace security constraints.`,
        },
      };
    }

    const buffer = await fetchAssetBuffer(asset.uri);

    await retryOperation(async () => {
      const { error: uploadError } = await client.storage
        .from(LISTING_IMAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: asset.mimeType || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }
    }, options.maxRetries ?? 3);

    return {
      success: true,
      result: {
        storagePath,
        altText: asset.altText ?? options.altText ?? null,
        sortOrder: options.sortOrder ?? 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'upload_failed',
        message: err instanceof Error ? err.message : 'Image upload failed.',
        cause: err,
      },
    };
  }
}

export async function rollbackUploadedObjects(
  client: SupabaseClient,
  storagePaths: string[],
): Promise<void> {
  if (!storagePaths || storagePaths.length === 0) return;
  const validPaths = storagePaths.filter((p) => isValidListingImageObjectPath(p));
  if (validPaths.length === 0) return;

  try {
    await client.storage.from(LISTING_IMAGE_BUCKET).remove(validPaths);
  } catch {
    // Best-effort cleanup rollback
  }
}

export async function uploadListingImages(
  client: SupabaseClient,
  assets: ProcessedMediaAsset[],
  sellerId: string,
  listingId: string,
): Promise<
  | { success: true; results: MediaUploadResult[] }
  | { success: false; error: MediaError; rolledBackPaths: string[] }
> {
  const uploadedPaths: string[] = [];
  const results: MediaUploadResult[] = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const uploadRes = await uploadSingleImage(client, asset, {
      sellerId,
      listingId,
      altText: asset.altText,
      sortOrder: i,
    });

    if (!uploadRes.success) {
      await rollbackUploadedObjects(client, uploadedPaths);
      return {
        success: false,
        error: uploadRes.error,
        rolledBackPaths: uploadedPaths,
      };
    }

    uploadedPaths.push(uploadRes.result.storagePath);
    results.push(uploadRes.result);
  }

  return { success: true, results };
}

export async function persistListingImageRows(
  client: SupabaseClient,
  listingId: string,
  images: MediaUploadResult[],
): Promise<{ success: true } | { success: false; error: MediaError }> {
  if (images.length === 0) return { success: true };

  const rows = images.map((img, idx) => ({
    listing_id: listingId,
    storage_path: img.storagePath,
    alt_text: img.altText ?? null,
    sort_order: img.sortOrder ?? idx,
  }));

  const { error } = await client.from('listing_images').insert(rows);

  if (error) {
    return {
      success: false,
      error: {
        code: 'db_persistence_failed',
        message: `Failed to insert listing image metadata rows: ${error.message}`,
        cause: error,
      },
    };
  }

  return { success: true };
}

export async function removeListingImage(
  client: SupabaseClient,
  storagePath: string,
  listingImageId?: string,
): Promise<{ success: true } | { success: false; error: MediaError }> {
  try {
    if (listingImageId) {
      const { error: dbErr } = await client
        .from('listing_images')
        .delete()
        .eq('id', listingImageId);
      if (dbErr) {
        return {
          success: false,
          error: {
            code: 'delete_failed',
            message: `Failed to delete database record: ${dbErr.message}`,
            cause: dbErr,
          },
        };
      }
    } else {
      const { error: dbErr } = await client
        .from('listing_images')
        .delete()
        .eq('storage_path', storagePath);
      if (dbErr) {
        return {
          success: false,
          error: {
            code: 'delete_failed',
            message: `Failed to delete database record: ${dbErr.message}`,
            cause: dbErr,
          },
        };
      }
    }

    if (isValidListingImageObjectPath(storagePath)) {
      const { error: storageErr } = await client.storage
        .from(LISTING_IMAGE_BUCKET)
        .remove([storagePath]);

      if (storageErr) {
        return {
          success: false,
          error: {
            code: 'delete_failed',
            message: `Failed to delete storage object: ${storageErr.message}`,
            cause: storageErr,
          },
        };
      }
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'delete_failed',
        message: err instanceof Error ? err.message : 'Image removal failed.',
        cause: err,
      },
    };
  }
}

export async function resolveSignedUrl(
  client: SupabaseClient,
  storagePath: string,
  expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRES_IN,
): Promise<{ signedUrl: string; expiresAt: string } | null> {
  if (!storagePath || typeof storagePath !== 'string') return null;

  // If path is already a full HTTPS URL (e.g. legacy or test fixture), return directly
  if (/^https?:\/\//i.test(storagePath)) {
    return {
      signedUrl: storagePath,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  try {
    const { data, error } = await client.storage
      .from(LISTING_IMAGE_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data || !data.signedUrl) {
      return null;
    }

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    return { signedUrl: data.signedUrl, expiresAt };
  } catch {
    return null;
  }
}

export async function resolveSignedUrls(
  client: SupabaseClient,
  storagePaths: string[],
  expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRES_IN,
): Promise<Map<string, { signedUrl: string; expiresAt: string }>> {
  const result = new Map<string, { signedUrl: string; expiresAt: string }>();
  if (!storagePaths || storagePaths.length === 0) return result;

  const validPaths = storagePaths.filter((p) => typeof p === 'string' && p.trim().length > 0);
  if (validPaths.length === 0) return result;

  // Handle paths that are already full HTTPS URLs
  const pathsToSign: string[] = [];
  const expiresAtDefault = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  for (const path of validPaths) {
    if (/^https?:\/\//i.test(path)) {
      result.set(path, { signedUrl: path, expiresAt: expiresAtDefault });
    } else {
      pathsToSign.push(path);
    }
  }

  if (pathsToSign.length === 0) return result;

  try {
    const { data, error } = await client.storage
      .from(LISTING_IMAGE_BUCKET)
      .createSignedUrls(pathsToSign, expiresInSeconds);

    if (!error && Array.isArray(data)) {
      data.forEach((item) => {
        if (item.path && item.signedUrl) {
          result.set(item.path, {
            signedUrl: item.signedUrl,
            expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
          });
        }
      });
    }
  } catch {
    // If batch signing fails, fall back to individual resolution
    for (const path of pathsToSign) {
      const res = await resolveSignedUrl(client, path, expiresInSeconds);
      if (res) {
        result.set(path, res);
      }
    }
  }

  return result;
}

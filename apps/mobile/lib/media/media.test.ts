import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  computeScaledDimensions,
  formatListingImageStoragePath,
  isValidDimensions,
  isValidFileSize,
  isValidListingImageObjectPath,
  isValidMimeType,
  isValidUuid,
  resolveSignedUrl,
  resolveSignedUrls,
  rollbackUploadedObjects,
  validateMediaAsset,
} from './index.ts';

const VALID_SELLER_ID = '11111111-1111-4111-8111-111111111111';
const VALID_LISTING_ID = '22222222-2222-4222-8222-222222222222';

test('isValidUuid validates standard UUID v4 strings', () => {
  assert.equal(isValidUuid(VALID_SELLER_ID), true);
  assert.equal(isValidUuid(VALID_LISTING_ID), true);
  assert.equal(isValidUuid('invalid-uuid'), false);
  assert.equal(isValidUuid(''), false);
});

test('MIME type validation restricts to JPEG, PNG, and WebP', () => {
  assert.equal(isValidMimeType('image/jpeg'), true);
  assert.equal(isValidMimeType('IMAGE/JPG'), true);
  assert.equal(isValidMimeType('image/png'), true);
  assert.equal(isValidMimeType('image/webp'), true);
  assert.equal(isValidMimeType('image/gif'), false);
  assert.equal(isValidMimeType('application/pdf'), false);
  assert.equal(isValidMimeType(''), false);
});

test('File size validation enforces 10MB default ceiling', () => {
  assert.equal(isValidFileSize(1024), true);
  assert.equal(isValidFileSize(MAX_FILE_SIZE_BYTES), true);
  assert.equal(isValidFileSize(MAX_FILE_SIZE_BYTES + 1), false);
  assert.equal(isValidFileSize(0), false);
  assert.equal(isValidFileSize(-50), false);
});

test('Dimension validation enforces min and max constraints', () => {
  assert.equal(isValidDimensions(800, 600), true);
  assert.equal(isValidDimensions(4096, 4096), true);
  assert.equal(isValidDimensions(4097, 100), false);
  assert.equal(isValidDimensions(0, 0), false);
});

test('isValidListingImageObjectPath enforces SQL migration namespace policy', () => {
  const validPath = `${VALID_SELLER_ID}/${VALID_LISTING_ID}/photo_001.jpg`;
  assert.equal(isValidListingImageObjectPath(validPath), true);

  // Invalid seller ID
  assert.equal(isValidListingImageObjectPath(`not-a-uuid/${VALID_LISTING_ID}/img.jpg`), false);
  // Invalid listing ID
  assert.equal(isValidListingImageObjectPath(`${VALID_SELLER_ID}/not-a-uuid/img.jpg`), false);
  // Trailing slash
  assert.equal(isValidListingImageObjectPath(`${validPath}/`), false);
  // Path traversal attempt
  assert.equal(
    isValidListingImageObjectPath(`${VALID_SELLER_ID}/${VALID_LISTING_ID}/../secret.jpg`),
    false,
  );
  // Forbidden characters (spaces)
  assert.equal(
    isValidListingImageObjectPath(`${VALID_SELLER_ID}/${VALID_LISTING_ID}/my image.jpg`),
    false,
  );
});

test('formatListingImageStoragePath constructs valid path', () => {
  const path = formatListingImageStoragePath(VALID_SELLER_ID, VALID_LISTING_ID, 'my photo.jpg');
  assert.equal(path, `${VALID_SELLER_ID}/${VALID_LISTING_ID}/my_photo.jpg`);
  assert.equal(isValidListingImageObjectPath(path), true);
});

test('validateMediaAsset passes valid assets and rejects invalid ones', () => {
  const validRes = validateMediaAsset({
    uri: 'file:///tmp/photo.jpg',
    fileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024 * 1024,
    width: 1200,
    height: 900,
  });

  assert.equal(validRes.valid, true);
  if (validRes.valid) {
    assert.equal(validRes.asset.mimeType, 'image/jpeg');
    assert.equal(validRes.asset.width, 1200);
  }

  const invalidMimeRes = validateMediaAsset({
    uri: 'file:///tmp/doc.pdf',
    fileName: 'doc.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
  });
  assert.equal(invalidMimeRes.valid, false);
  if (!invalidMimeRes.valid) {
    assert.equal(invalidMimeRes.error.code, 'invalid_mime');
  }

  const oversizedRes = validateMediaAsset({
    uri: 'file:///tmp/huge.jpg',
    fileName: 'huge.jpg',
    mimeType: 'image/jpeg',
    fileSize: 20 * 1024 * 1024,
  });
  assert.equal(oversizedRes.valid, false);
  if (!oversizedRes.valid) {
    assert.equal(oversizedRes.error.code, 'size_exceeded');
  }
});

test('computeScaledDimensions preserves aspect ratio when exceeding max dimension', () => {
  const landscape = computeScaledDimensions(3840, 2160, 1920);
  assert.equal(landscape.width, 1920);
  assert.equal(landscape.height, 1080);

  const portrait = computeScaledDimensions(2160, 3840, 1920);
  assert.equal(portrait.width, 1080);
  assert.equal(portrait.height, 1920);

  const small = computeScaledDimensions(800, 600, 1920);
  assert.equal(small.width, 800);
  assert.equal(small.height, 600);
});

test('resolveSignedUrl and resolveSignedUrls handle mock client and URLs without getPublicUrl', async () => {
  const mockClient = {
    storage: {
      from(bucketName: string) {
        assert.equal(bucketName, 'listing-images');
        return {
          async createSignedUrl(path: string, expiresIn: number) {
            return {
              data: { signedUrl: `https://example.com/signed/${path}?expires=${expiresIn}` },
              error: null,
            };
          },
          async createSignedUrls(paths: string[], expiresIn: number) {
            return {
              data: paths.map((path) => ({
                path,
                signedUrl: `https://example.com/signed/${path}?expires=${expiresIn}`,
                error: null,
              })),
              error: null,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  const path = `${VALID_SELLER_ID}/${VALID_LISTING_ID}/photo.jpg`;
  const single = await resolveSignedUrl(mockClient, path, 600);
  assert.notEqual(single, null);
  assert.equal(single?.signedUrl.includes('https://example.com/signed/'), true);
  assert.notEqual(single?.expiresAt, undefined);

  const map = await resolveSignedUrls(mockClient, [path], 600);
  assert.equal(map.has(path), true);
  assert.equal(map.get(path)?.signedUrl.includes('https://example.com/signed/'), true);
});

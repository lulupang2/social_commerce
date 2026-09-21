'use client';

import { z } from 'zod';

import { getGoSession } from '../go-auth/client';

export const GO_LISTING_IMAGE_MAX_COUNT = 12;
export const GO_LISTING_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const supportedMimeTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export const signedImageSchema = z
  .object({
    id: z.string().uuid(),
    state: z.literal('signed'),
    url: z.string().url(),
    expiresAt: z.string().datetime({ offset: true }),
    altText: z.string().trim().max(160).nullable().optional(),
    sortOrder: z
      .number()
      .int()
      .min(0)
      .max(GO_LISTING_IMAGE_MAX_COUNT - 1),
  })
  .strict();

const imageListSchema = z
  .object({
    listingId: z.string().uuid(),
    images: z.array(signedImageSchema).max(GO_LISTING_IMAGE_MAX_COUNT),
  })
  .strict();

const uploadSlotSchema = z
  .object({
    imageId: z.string().uuid(),
    uploadUrl: z.string().url(),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

const completeUploadSchema = z
  .object({
    imageId: z.string().uuid(),
    state: z.literal('ready'),
  })
  .strict();

const apiFailureSchema = z
  .object({
    code: z.string().optional(),
    message: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export type GoListingImage = z.infer<typeof signedImageSchema>;

export type ImageApiResult<T> =
  { ok: true; data: T } | { ok: false; status?: number; code?: string; message: string };

export interface UploadGoListingImageOptions {
  sortOrder?: number;
  replaceImageId?: string;
  altText?: string;
}

function canonicalMimeType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

function imagePath(listingId: string): string {
  return '/api/v1/listings/' + encodeURIComponent(listingId) + '/images';
}

async function responseFailure(
  response: Response,
  fallback: string,
): Promise<ImageApiResult<never>> {
  const body = apiFailureSchema.safeParse(await response.json().catch(() => null));
  return {
    ok: false,
    status: response.status,
    ...(body.success && body.data.code ? { code: body.data.code } : {}),
    message: body.success && body.data.message ? body.data.message : fallback,
  };
}

async function csrfToken(): Promise<ImageApiResult<string>> {
  const session = await getGoSession();
  if (!session.ok) {
    if (session.status === 401) {
      return {
        ok: false,
        status: 401,
        code: 'UNAUTHENTICATED',
        message: '로그인 후 사진을 저장할 수 있어요.',
      };
    }
    return {
      ok: false,
      status: session.status,
      message: session.message || '로그인 상태를 확인하지 못했어요.',
    };
  }
  return { ok: true, data: session.session.csrfToken };
}

export async function listGoListingImages(
  listingId: string,
): Promise<ImageApiResult<GoListingImage[]>> {
  try {
    const response = await fetch(imagePath(listingId), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) {
      return responseFailure(response, '매물 사진을 불러오지 못했어요.');
    }
    const parsed = imageListSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.listingId !== listingId) {
      return {
        ok: false,
        status: response.status,
        code: 'INVALID_RESPONSE',
        message: '사진 응답 형식이 올바르지 않아요.',
      };
    }
    return {
      ok: true,
      data: parsed.data.images.slice().sort((left, right) => left.sortOrder - right.sortOrder),
    };
  } catch {
    return { ok: false, message: '매물 사진 서버에 연결하지 못했어요.' };
  }
}

export async function deleteGoListingImage(
  listingId: string,
  imageId: string,
): Promise<ImageApiResult<null>> {
  const csrf = await csrfToken();
  if (!csrf.ok) return csrf;

  try {
    const response = await fetch(imagePath(listingId) + '/' + encodeURIComponent(imageId), {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-CSRF-Token': csrf.data,
      },
    });
    if (!response.ok) {
      return responseFailure(response, '사진을 삭제하지 못했어요.');
    }
    return { ok: true, data: null };
  } catch {
    return { ok: false, message: '사진 삭제 중 서버에 연결하지 못했어요.' };
  }
}

async function cleanupUploadSlot(listingId: string, imageId: string): Promise<void> {
  await deleteGoListingImage(listingId, imageId).catch(() => undefined);
}

export async function uploadGoListingImage(
  listingId: string,
  file: File,
  options: UploadGoListingImageOptions,
): Promise<ImageApiResult<{ imageId: string }>> {
  const mimeType = canonicalMimeType(file.type);
  if (
    !supportedMimeTypes.has(file.type.trim().toLowerCase()) ||
    !supportedMimeTypes.has(mimeType)
  ) {
    return {
      ok: false,
      code: 'IMAGE_INVALID',
      message: 'JPG, PNG, WebP 사진만 업로드할 수 있어요.',
    };
  }
  if (file.size <= 0 || file.size > GO_LISTING_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      code: 'IMAGE_INVALID',
      message: '장당 10MB 이하의 사진을 선택해 주세요.',
    };
  }
  if (
    options.sortOrder !== undefined &&
    (!Number.isInteger(options.sortOrder) ||
      options.sortOrder < 0 ||
      options.sortOrder >= GO_LISTING_IMAGE_MAX_COUNT)
  ) {
    return { ok: false, code: 'IMAGE_INVALID', message: '사진 순서가 올바르지 않아요.' };
  }

  const csrf = await csrfToken();
  if (!csrf.ok) return csrf;

  let imageId: string | null = null;
  try {
    const slotResponse = await fetch(imagePath(listingId) + '/uploads', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf.data,
      },
      body: JSON.stringify({
        mimeType,
        fileSizeBytes: file.size,
        ...(options.altText ? { altText: options.altText.slice(0, 160) } : {}),
        ...(options.sortOrder !== undefined ? { sortOrder: options.sortOrder } : {}),
        ...(options.replaceImageId ? { replaceImageId: options.replaceImageId } : {}),
      }),
    });
    if (!slotResponse.ok) {
      return responseFailure(slotResponse, '사진 업로드를 시작하지 못했어요.');
    }
    const slot = uploadSlotSchema.safeParse(await slotResponse.json());
    if (!slot.success) {
      return {
        ok: false,
        status: slotResponse.status,
        code: 'INVALID_RESPONSE',
        message: '사진 업로드 응답 형식이 올바르지 않아요.',
      };
    }
    imageId = slot.data.imageId;

    const storageResponse = await fetch(slot.data.uploadUrl, {
      method: 'PUT',
      credentials: 'omit',
      headers: {
        'Content-Type': mimeType,
      },
      body: file,
    });
    if (!storageResponse.ok) {
      await cleanupUploadSlot(listingId, imageId);
      return {
        ok: false,
        status: storageResponse.status,
        code: 'IMAGE_UPLOAD_FAILED',
        message: '사진 전송에 실패했어요. 다시 시도해 주세요.',
      };
    }

    const completeResponse = await fetch(
      imagePath(listingId) + '/' + encodeURIComponent(imageId) + '/complete',
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-CSRF-Token': csrf.data,
        },
      },
    );
    if (!completeResponse.ok) {
      const failure = await responseFailure(completeResponse, '사진 업로드를 완료하지 못했어요.');
      await cleanupUploadSlot(listingId, imageId);
      return failure;
    }

    const completed = completeUploadSchema.safeParse(await completeResponse.json());
    if (!completed.success || completed.data.imageId !== imageId) {
      await cleanupUploadSlot(listingId, imageId);
      return {
        ok: false,
        status: completeResponse.status,
        code: 'INVALID_RESPONSE',
        message: '사진 완료 응답 형식이 올바르지 않아요.',
      };
    }
    return { ok: true, data: { imageId } };
  } catch {
    if (imageId) await cleanupUploadSlot(listingId, imageId);
    return { ok: false, message: '사진 업로드 중 서버에 연결하지 못했어요.' };
  }
}

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
  { ok: true; data: T } | { ok: false; status?: number; code?: string; message: string; pendingImageId?: string; uploadPhase?: 'cleanup' | 'confirm' };

export interface UploadGoListingImageOptions {
  sortOrder?: number;
  replaceImageId?: string;
  altText?: string;
  pendingImageId?: string;
  uploadPhase?: 'cleanup' | 'confirm';
}

export function isSignedImageExpired(image: { expiresAt: string }, now = Date.now()): boolean {
  return !Number.isFinite(Date.parse(image.expiresAt)) || Date.parse(image.expiresAt) <= now;
}

export function nextGoListingImageSortOrder(images: ReadonlyArray<{ sortOrder: number }>): number | undefined {
  const occupied = new Set(images.map((image) => image.sortOrder));
  for (let order = 0; order < GO_LISTING_IMAGE_MAX_COUNT; order += 1) {
    if (!occupied.has(order)) return order;
  }
  return undefined;
}

export function imageApiErrorMessage(failure: { code?: string; status?: number; message: string }): string {
  if (failure.status === 401 || failure.code === 'UNAUTHENTICATED') return '로그인이 만료됐어요. 새 창에서 다시 로그인한 뒤 재시도해 주세요.';
  if (failure.status === 503) return '사진 저장 서비스를 사용할 수 없어요. 입력은 유지되며 잠시 후 재시도할 수 있어요.';
  if (failure.status === 404) return '매물이나 사진을 찾을 수 없어요. 사진을 갱신해 주세요.';
  if (failure.status === 410 || failure.code === 'IMAGE_UPLOAD_EXPIRED') return '업로드 주소가 만료됐어요. 재시도하면 새 주소를 발급받아요.';
  if (failure.code === 'IMAGE_LIMIT_EXCEEDED') return '사진은 최대 12장이에요. 기존 사진을 삭제하거나 교체해 주세요.';
  if (failure.status === 409) return '사진 상태가 변경되었거나 처리 중이에요. 사진을 갱신한 뒤 재시도해 주세요.';
  return failure.message;
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
  const code = body.success && body.data.code ? body.data.code :
    ({ 401: 'UNAUTHENTICATED', 404: 'IMAGE_NOT_FOUND', 409: 'IMAGE_CONFLICT', 410: 'IMAGE_UPLOAD_EXPIRED', 503: 'IMAGE_STORAGE_UNAVAILABLE' } as Record<number, string>)[response.status];
  const failure = {
    ok: false as const,
    status: response.status,
    code,
    message: body.success && body.data.message ? body.data.message : fallback,
  };
  return { ...failure, message: imageApiErrorMessage(failure) };
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
      const failure = await responseFailure(response, '매물 사진을 불러오지 못했어요.');
      return !failure.ok && response.status === 503
        ? { ...failure, message: '매물 사진을 불러오지 못했어요. 잠시 후 사진을 갱신해 주세요.' }
        : failure;
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

async function cleanupUploadSlot(listingId: string, imageId: string): Promise<ImageApiResult<null>> {
  const result = await deleteGoListingImage(listingId, imageId);
  if (!result.ok && result.status === 404) return { ok: true, data: null };
  return result;
}

async function recoverCompletion(listingId: string, imageId: string): Promise<ImageApiResult<{ imageId: string }>> {
  const images = await listGoListingImages(listingId);
  if (images.ok && images.data.some((image) => image.id === imageId)) {
    return { ok: true, data: { imageId } };
  }
  return {
    ok: false,
    ...(!images.ok ? { status: images.status, code: images.code } : { code: 'IMAGE_CONFLICT', status: 409 }),
    message: !images.ok ? images.message : '사진 완료 여부를 아직 확인하지 못했어요. 다시 확인해 주세요.',
    pendingImageId: imageId,
    uploadPhase: 'confirm',
  };
}

export async function uploadGoListingImage(
  listingId: string,
  file: File,
  options: UploadGoListingImageOptions,
): Promise<ImageApiResult<{ imageId: string }>> {
  if (options.pendingImageId) {
    if (options.uploadPhase === 'confirm') {
      const confirmed = await recoverCompletion(listingId, options.pendingImageId);
      if (confirmed.ok || confirmed.status !== 409) return confirmed;
      const csrf = await csrfToken();
      if (!csrf.ok) return { ...csrf, pendingImageId: options.pendingImageId, uploadPhase: 'confirm' };
      try {
        const response = await fetch(imagePath(listingId) + '/' + encodeURIComponent(options.pendingImageId) + '/complete', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json', 'X-CSRF-Token': csrf.data },
        });
        if (response.ok) {
          const complete = completeUploadSchema.safeParse(await response.json());
          if (complete.success && complete.data.imageId === options.pendingImageId) return { ok: true, data: { imageId: options.pendingImageId } };
        }
        const recovered = await recoverCompletion(listingId, options.pendingImageId);
        if (recovered.ok || recovered.status !== 409) return recovered;
        if ([400, 404, 410].includes(response.status)) {
          const failure = await responseFailure(response, '사진 완료에 실패했어요.');
          const cleanup = await cleanupUploadSlot(listingId, options.pendingImageId);
          if (!failure.ok) return cleanup.ok ? failure : { ...failure, pendingImageId: options.pendingImageId, uploadPhase: 'cleanup' };
        }
        return recovered;
      } catch {
        return recoverCompletion(listingId, options.pendingImageId);
      }
    }
    const cleanup = await cleanupUploadSlot(listingId, options.pendingImageId);
    if (!cleanup.ok) return { ...cleanup, pendingImageId: options.pendingImageId, uploadPhase: 'cleanup' };
  }
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
  if (!options.replaceImageId && options.sortOrder === undefined) {
    return { ok: false, code: 'IMAGE_INVALID', message: '새 사진의 빈 순서가 필요해요.' };
  }

  const csrf = await csrfToken();
  if (!csrf.ok) return csrf;

  let imageId: string | null = null;
  let completing = false;
  const cleanupFailure = async (failure: Extract<ImageApiResult<never>, { ok: false }>): Promise<ImageApiResult<never>> => {
    if (!imageId) return failure;
    const cleanup = await cleanupUploadSlot(listingId, imageId);
    return cleanup.ok ? failure : { ...failure, pendingImageId: imageId, uploadPhase: 'cleanup' };
  };
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
        ...(options.altText?.trim() ? { altText: options.altText.trim().slice(0, 160) } : {}),
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
    if (isSignedImageExpired(slot.data)) {
      return cleanupFailure({ ok: false, status: 410, code: 'IMAGE_UPLOAD_EXPIRED', message: '업로드 주소가 만료됐어요. 새 주소로 재시도해 주세요.' });
    }

    const storageResponse = await fetch(slot.data.uploadUrl, {
      method: 'PUT',
      credentials: 'omit',
      headers: {
        'Content-Type': mimeType,
      },
      body: file,
    });
    if (!storageResponse.ok) {
      const expired = storageResponse.status === 401 || storageResponse.status === 403 || storageResponse.status === 410;
      return cleanupFailure({
        ok: false,
        status: expired ? 410 : storageResponse.status,
        code: expired ? 'IMAGE_UPLOAD_EXPIRED' : 'IMAGE_UPLOAD_FAILED',
        message: expired ? '업로드 주소가 만료됐어요. 재시도해 주세요.' : '사진 전송에 실패했어요. 다시 시도해 주세요.',
      });
    }
    completing = true;

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
      const recovered = await recoverCompletion(listingId, imageId);
      if (recovered.ok) return recovered;
      if (!failure.ok && [400, 404, 410].includes(completeResponse.status) && recovered.status === 409) {
        completing = false;
        return cleanupFailure(failure);
      }
      return { ...recovered, ...(!failure.ok ? { status: failure.status, code: failure.code, message: failure.message } : {}) };
    }

    const completed = completeUploadSchema.safeParse(await completeResponse.json());
    if (!completed.success || completed.data.imageId !== imageId) {
      return recoverCompletion(listingId, imageId);
    }
    return { ok: true, data: { imageId } };
  } catch {
    if (imageId && completing) return recoverCompletion(listingId, imageId);
    return cleanupFailure({ ok: false, code: 'NETWORK_ERROR', message: '사진 업로드 중 서버에 연결하지 못했어요.' });
  }
}

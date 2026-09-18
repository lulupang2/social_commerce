'use client';

import {
  createCommunityPostSchema,
  createListingSchema,
  type CreateCommunityPost,
  type CreateListing,
} from '@icegear/domain';

import { createBrowserSupabaseClient, type BrowserSupabaseClient } from './browser';
import type { Database } from './database.types';

export type MutationFailureReason =
  | 'unconfigured'
  | 'unavailable'
  | 'unauthenticated'
  | 'validation_failed'
  | 'request_failed';

export interface MutationFailure {
  ok: false;
  reason: MutationFailureReason;
  message: string;
}

export type MutationResult<T> = { ok: true; data: T } | MutationFailure;

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

async function authenticatedClient(): Promise<
  | {
      client: BrowserSupabaseClient;
      userId: string;
      failure: null;
    }
  | {
      client: null;
      userId: null;
      failure: MutationFailure;
    }
> {
  const client = createBrowserSupabaseClient();
  if (!client) {
    return {
      client: null,
      userId: null,
      failure: {
        ok: false,
        reason: 'unconfigured',
        message: 'Supabase 연결 정보가 없어 이 기기에서 데모 모드로 저장해요.',
      },
    };
  }

  const { data, error } = await client.auth.getUser();
  if (error) {
    return {
      client: null,
      userId: null,
      failure: {
        ok: false,
        reason: 'unavailable',
        message: '서버에 연결하지 못해 이 기기에서 데모 모드로 저장해요.',
      },
    };
  }
  if (!data.user) {
    return {
      client: null,
      userId: null,
      failure: {
        ok: false,
        reason: 'unauthenticated',
        message: '로그인 후 실제 SummerGear에 등록할 수 있어요.',
      },
    };
  }

  return { client, userId: data.user.id, failure: null };
}

export async function createListing(
  input: CreateListing,
  files: File[],
): Promise<MutationResult<{ id: string; status: 'pending_review' }>> {
  const parsed = createListingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'validation_failed',
      message: parsed.error.issues[0]?.message ?? '매물 정보를 다시 확인해 주세요.',
    };
  }

  let authentication;
  try {
    authentication = await authenticatedClient();
  } catch {
    return {
      ok: false,
      reason: 'unavailable',
      message: '서버에 연결하지 못해 이 기기에서 데모 모드로 저장해요.',
    };
  }
  if (authentication.failure) return authentication.failure;
  const { client, userId } = authentication;

  const { data: sport, error: sportError } = await client
    .from('sports')
    .select('id')
    .eq('slug', parsed.data.sport)
    .eq('is_active', true)
    .maybeSingle();
  if (sportError || !sport) {
    return {
      ok: false,
      reason: sportError ? 'unavailable' : 'request_failed',
      message: '선택한 스포츠 정보를 확인하지 못했어요.',
    };
  }

  const { data: listing, error: listingError } = await client
    .from('listings')
    .insert({
      seller_id: userId,
      sport_id: sport.id,
      category: parsed.data.category,
      title: parsed.data.title,
      description: parsed.data.description,
      price:
        typeof parsed.data.price === 'number' ? parsed.data.price : parsed.data.price.amount,
      currency:
        typeof parsed.data.price === 'number'
          ? (parsed.data.currency ?? 'KRW')
          : parsed.data.price.currency,
      condition: parsed.data.condition,
      status: 'draft',
      details: parsed.data.details,
      location_text:
        typeof parsed.data.location === 'string'
          ? parsed.data.location
          : (parsed.data.location?.raw ??
            ([parsed.data.location?.region, parsed.data.location?.city]
              .filter(Boolean)
              .join(' ') ||
              null)),
    })
    .select('id')
    .single();
  if (listingError || !listing) {
    return {
      ok: false,
      reason: 'request_failed',
      message: '판매글을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
    };
  }

  const uploadedPaths: string[] = [];
  try {
    for (const [index, file] of files.slice(0, 10).entries()) {
      const extension = EXTENSION_BY_MIME_TYPE[file.type.toLowerCase()] ?? 'jpg';
      const path = `${userId}/${listing.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await client.storage.from('listing-images').upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);

      const { error: metadataError } = await client.from('listing_images').insert({
        listing_id: listing.id,
        storage_path: path,
        alt_text: `${parsed.data.title} 사진 ${index + 1}`,
        sort_order: index,
      });
      if (metadataError) throw metadataError;
    }

    const { data: reviewedListing, error: reviewError } = await client
      .from('listings')
      .update({ status: 'pending_review' })
      .eq('id', listing.id)
      .select('id')
      .maybeSingle();
    if (reviewError || !reviewedListing) throw reviewError ?? new Error('review_transition_failed');
  } catch {
    if (uploadedPaths.length > 0) {
      await client.storage.from('listing-images').remove(uploadedPaths);
    }
    await client.from('listings').delete().eq('id', listing.id);
    return {
      ok: false,
      reason: 'request_failed',
      message: '사진 업로드 중 문제가 생겼어요. 다시 시도해 주세요.',
    };
  }

  return { ok: true, data: { id: listing.id, status: 'pending_review' } };
}

export async function createCommunityPost(
  input: CreateCommunityPost,
): Promise<MutationResult<{ id: string; status: 'draft' }>> {
  const parsed = createCommunityPostSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'validation_failed',
      message: parsed.error.issues[0]?.message ?? '게시글 내용을 다시 확인해 주세요.',
    };
  }

  let authentication;
  try {
    authentication = await authenticatedClient();
  } catch {
    return {
      ok: false,
      reason: 'unavailable',
      message: '서버에 연결하지 못해 이 기기에서 데모 모드로 저장해요.',
    };
  }
  if (authentication.failure) return authentication.failure;
  const { client, userId } = authentication;

  let sportId: string | null = null;
  if (parsed.data.sport) {
    const { data: sport, error } = await client
      .from('sports')
      .select('id')
      .eq('slug', parsed.data.sport)
      .eq('is_active', true)
      .maybeSingle();
    if (error || !sport) {
      return {
        ok: false,
        reason: error ? 'unavailable' : 'request_failed',
        message: '선택한 스포츠 정보를 확인하지 못했어요.',
      };
    }
    sportId = sport.id;
  }

  const { data, error } = await client
    .from('community_posts')
    .insert({
      author_id: userId,
      sport_id: sportId,
      post_type: parsed.data.type,
      title: parsed.data.title,
      body: parsed.data.body,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error || !data) {
    return {
      ok: false,
      reason: 'request_failed',
      message: '게시글을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
    };
  }

  return { ok: true, data: { id: data.id, status: 'draft' } };
}

export async function registerPushToken(
  token: string,
  platform: 'ios' | 'android',
): Promise<MutationResult<{ registered: true }>> {
  let authentication;
  try {
    authentication = await authenticatedClient();
  } catch {
    return {
      ok: false,
      reason: 'unavailable',
      message: '알림 서버에 연결하지 못했어요.',
    };
  }
  if (authentication.failure) return authentication.failure;
  const { client, userId } = authentication;

  const deviceIdKey = 'summergear:device-id';
  let deviceId = window.localStorage.getItem(deviceIdKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    window.localStorage.setItem(deviceIdKey, deviceId);
  }

  const payload: Database['public']['Tables']['push_tokens']['Insert'] = {
    user_id: userId,
    expo_push_token: token,
    platform,
    device_id: deviceId,
  };
  const { error } = await client.from('push_tokens').upsert(payload, {
    onConflict: 'expo_push_token',
  });
  if (error) {
    return {
      ok: false,
      reason: 'request_failed',
      message: '알림 기기를 등록하지 못했어요.',
    };
  }

  return { ok: true, data: { registered: true } };
}

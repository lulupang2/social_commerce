import { z } from 'zod';

export const NATIVE_BRIDGE_EVENT = 'summergear:native-message' as const;
export const NATIVE_BRIDGE_REQUEST_TYPES = [
  'SUMMERGEAR_PICK_MEDIA',
  'SUMMERGEAR_HAPTIC',
  'SUMMERGEAR_REGISTER_PUSH',
  'SUMMERGEAR_LOCAL_NOTIFICATION',
] as const;
export const NATIVE_BRIDGE_RESPONSE_TYPES = [
  'SUMMERGEAR_MEDIA_RESULT',
  'SUMMERGEAR_PUSH_TOKEN_RESULT',
  'SUMMERGEAR_BRIDGE_ERROR',
] as const;

export const hapticStyleSchema = z.enum(['selection', 'success', 'warning', 'error']);
export type HapticStyle = z.infer<typeof hapticStyleSchema>;

export const mediaSourceSchema = z.enum(['camera', 'library']);
export type MediaSource = z.infer<typeof mediaSourceSchema>;

const bridgeRequestIdSchema = z.string().trim().min(1).max(100);

export const pickMediaRequestSchema = z
  .object({
    type: z.literal('SUMMERGEAR_PICK_MEDIA'),
    requestId: bridgeRequestIdSchema,
    source: mediaSourceSchema,
    maxCount: z.number().int().min(1).max(10),
  })
  .strict();
export type PickMediaRequest = z.infer<typeof pickMediaRequestSchema>;

export const nativeBridgeRequestSchema = z.discriminatedUnion('type', [
  pickMediaRequestSchema,
  z
    .object({
      type: z.literal('SUMMERGEAR_HAPTIC'),
      style: hapticStyleSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('SUMMERGEAR_REGISTER_PUSH'),
      requestId: bridgeRequestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('SUMMERGEAR_LOCAL_NOTIFICATION'),
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(500),
      route: z.string().startsWith('/').max(500).optional(),
    })
    .strict(),
]);
export type NativeBridgeRequest = z.infer<typeof nativeBridgeRequestSchema>;

export const bridgeMediaAssetSchema = z
  .object({
    id: z.string().trim().min(1).max(140),
    dataUrl: z.string().startsWith('data:image/').max(20_000_000),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/i),
    width: z.number().int().positive().max(20_000),
    height: z.number().int().positive().max(20_000),
  })
  .strict();
export type BridgeMediaAsset = z.infer<typeof bridgeMediaAssetSchema>;

export const nativeBridgeResponseSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('SUMMERGEAR_MEDIA_RESULT'),
      requestId: bridgeRequestIdSchema,
      assets: z.array(bridgeMediaAssetSchema).max(10),
    })
    .strict(),
  z
    .object({
      type: z.literal('SUMMERGEAR_PUSH_TOKEN_RESULT'),
      requestId: bridgeRequestIdSchema,
      token: z.string().trim().min(10).max(512),
      platform: z.enum(['ios', 'android']),
    })
    .strict(),
  z
    .object({
      type: z.literal('SUMMERGEAR_BRIDGE_ERROR'),
      requestId: bridgeRequestIdSchema.optional(),
      code: z.string().trim().min(1).max(80),
      message: z.string().trim().min(1).max(500),
    })
    .strict(),
]);
export type NativeBridgeResponse = z.infer<typeof nativeBridgeResponseSchema>;

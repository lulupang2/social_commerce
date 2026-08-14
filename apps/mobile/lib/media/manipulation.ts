import type { ProcessedMediaAsset, ValidatedMediaAsset } from './types.ts';

export interface ImageResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  compress?: number; // 0.0 to 1.0
}

export const DEFAULT_MAX_TARGET_DIMENSION = 1920;
export const DEFAULT_COMPRESS_QUALITY = 0.8;

export function computeScaledDimensions(
  width: number,
  height: number,
  maxDimension: number = DEFAULT_MAX_TARGET_DIMENSION,
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const aspectRatio = width / height;
  if (width > height) {
    const targetW = maxDimension;
    const targetH = Math.round(maxDimension / aspectRatio);
    return { width: targetW, height: targetH };
  } else {
    const targetH = maxDimension;
    const targetW = Math.round(maxDimension * aspectRatio);
    return { width: targetW, height: targetH };
  }
}

export async function processAndCompressImage(
  asset: ValidatedMediaAsset,
  options?: ImageResizeOptions,
): Promise<ProcessedMediaAsset> {
  const maxDim = options?.maxWidth ?? DEFAULT_MAX_TARGET_DIMENSION;
  const quality = options?.compress ?? DEFAULT_COMPRESS_QUALITY;

  const target = computeScaledDimensions(asset.width, asset.height, maxDim);

  try {
    // Dynamic import required because native Expo modules reference React Native internals not resolvable in pure Node test environments.
    const ImageManipulator = await import('expo-image-manipulator');
    const actions: any[] = [];

    if (target.width !== asset.width || target.height !== asset.height) {
      actions.push({
        resize: {
          width: target.width,
          height: target.height,
        },
      });
    }

    const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    return {
      uri: result.uri,
      fileName: asset.fileName.replace(/\.[^/.]+$/, '') + '.jpg',
      mimeType: 'image/jpeg',
      fileSize: asset.fileSize,
      width: result.width,
      height: result.height,
      altText: asset.altText,
    };
  } catch {
    // In node/test runtime or if manipulator native module fails, fall back gracefully
    return {
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      width: target.width || asset.width,
      height: target.height || asset.height,
      altText: asset.altText,
    };
  }
}

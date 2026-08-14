import type { MediaError, MediaValidationOptions, ValidatedMediaAsset } from './types.ts';
import { validateMediaAsset } from './validation.ts';

export async function requestPhotoPermissions(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  try {
    // Dynamic import required because native Expo modules reference React Native internals not resolvable in pure Node test environments.
    const ImagePicker = await import('expo-image-picker');
    const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return {
      granted: status === ImagePicker.PermissionStatus.GRANTED,
      canAskAgain,
    };
  } catch {
    return { granted: false, canAskAgain: true };
  }
}

export interface PickImagesOptions {
  selectionLimit?: number;
  validationOptions?: MediaValidationOptions;
}

export async function pickImages(
  options?: PickImagesOptions,
): Promise<
  { success: true; assets: ValidatedMediaAsset[] } | { success: false; error: MediaError }
> {
  const selectionLimit = options?.selectionLimit ?? 12;

  try {
    const permission = await requestPhotoPermissions();
    if (!permission.granted) {
      return {
        success: false,
        error: {
          code: 'permission_denied',
          message: 'Permission to access photo library was denied.',
        },
      };
    }

    // Dynamic import required because native Expo modules reference React Native internals not resolvable in pure Node test environments.
    const ImagePicker = await import('expo-image-picker');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: selectionLimit > 1,
      selectionLimit,
      quality: 1,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return {
        success: false,
        error: {
          code: 'selection_canceled',
          message: 'No images were selected.',
        },
      };
    }

    const validatedAssets: ValidatedMediaAsset[] = [];
    for (const rawAsset of result.assets) {
      const validation = validateMediaAsset(
        {
          uri: rawAsset.uri,
          fileName: rawAsset.fileName,
          mimeType: rawAsset.mimeType,
          fileSize: rawAsset.fileSize,
          width: rawAsset.width,
          height: rawAsset.height,
        },
        options?.validationOptions,
      );

      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      validatedAssets.push(validation.asset);
    }

    return { success: true, assets: validatedAssets };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'selection_canceled',
        message: error instanceof Error ? error.message : 'Image selection failed.',
        cause: error,
      },
    };
  }
}

'use client';

import Image from 'next/image';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  X,
} from 'lucide-react';
import React, { useRef, useState } from 'react';

import { NativeBridgeError, requestNativeMedia, triggerNativeHaptic } from '@/lib/native-bridge';
import { isSignedImageExpired } from '@/lib/go-listings/images';

export type MediaUploadState = 'idle' | 'uploading' | 'uploaded' | 'failed';

export interface SelectedMedia {
  id: string;
  previewUrl: string;
  fileName: string;
  mimeType: string;
  file?: File;
  serverId?: string;
  uploadState?: MediaUploadState;
  uploadError?: string;
  sortOrder?: number;
  expiresAt?: string;
  replaceImageId?: string;
  uploadErrorCode?: string;
  pendingImageId?: string;
  uploadPhase?: 'cleanup' | 'confirm';
}

interface MediaPickerProps {
  label: string;
  maxCount: number;
  value: SelectedMedia[];
  onChange(value: SelectedMedia[]): void;
  helper?: string;
  disabled?: boolean;
  allowReorder?: boolean;
  onRetry?(id: string): void;
  allowReplace?: boolean;
  onRefresh?(): void;
}

const ALLOWED_IMAGE_TYPES: Record<string, true> = {
  'image/jpeg': true,
  'image/jpg': true,
  'image/png': true,
  'image/webp': true,
};
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function mediaId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function selectedMediaToFile(media: SelectedMedia): Promise<File> {
  if (media.file) return media.file;
  const response = await fetch(media.previewUrl);
  if (!response.ok) throw new Error('media_fetch_failed');
  const blob = await response.blob();
  return new File([blob], media.fileName, { type: media.mimeType || blob.type });
}

export function MediaPicker({
  label,
  maxCount,
  value,
  onChange,
  helper = 'JPG, PNG, WebP · 장당 최대 10MB',
  disabled = false,
  allowReorder = true,
  onRetry,
  allowReplace = false,
  onRefresh,
}: MediaPickerProps) {
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const replacementInputRef = useRef<HTMLInputElement>(null);
  const replacementIdRef = useRef<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [error, setError] = useState('');
  const remainingCount = Math.max(0, maxCount - value.length);
  const interactionDisabled = disabled || isPicking;
  const coverId = value.reduce<SelectedMedia | undefined>(
    (cover, media, index) =>
      !cover || (media.sortOrder ?? index) < (cover.sortOrder ?? value.indexOf(cover))
        ? media
        : cover,
    undefined,
  )?.id;

  const replaceBrowserFile = (files: FileList | null) => {
    const target = value.find((media) => media.id === replacementIdRef.current);
    const file = files?.[0];
    if (replacementInputRef.current) replacementInputRef.current.value = '';
    replacementIdRef.current = null;
    if (!target || !file || interactionDisabled || target.pendingImageId) return;
    if (!ALLOWED_IMAGE_TYPES[file.type.toLowerCase()] || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      setError('JPG, PNG, WebP · 장당 10MB 이하의 사진을 선택해 주세요.');
      return;
    }
    setError('');
    if (target.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
    onChange(value.map((media) => media.id === target.id ? {
      id: media.id,
      sortOrder: media.sortOrder,
      replaceImageId: media.serverId ?? media.replaceImageId,
      previewUrl: URL.createObjectURL(file),
      fileName: file.name,
      mimeType: file.type,
      file,
      uploadState: 'idle',
    } : media));
  };

  const addNativeMedia = async (source: 'camera' | 'library') => {
    if (remainingCount === 0 || interactionDisabled) return;
    setError('');
    setIsPicking(true);

    try {
      const assets = await requestNativeMedia(source, source === 'camera' ? 1 : remainingCount);
      if (assets === null) {
        const fallbackInput =
          source === 'camera' ? cameraInputRef.current : libraryInputRef.current;
        fallbackInput?.click();
        return;
      }

      if (assets.length > 0) {
        const accepted = assets
          .slice(0, remainingCount)
          .filter((asset) => ALLOWED_IMAGE_TYPES[asset.mimeType.toLowerCase()] === true);
        if (accepted.length !== Math.min(assets.length, remainingCount)) {
          setError('JPG, PNG, WebP 사진만 추가할 수 있어요.');
        }
        if (accepted.length > 0) {
          onChange([
            ...value,
            ...accepted.map((asset) => ({
              id: asset.id,
              previewUrl: asset.dataUrl,
              fileName: asset.fileName,
              mimeType: asset.mimeType,
              uploadState: 'idle' as const,
            })),
          ]);
          triggerNativeHaptic('selection');
        }
      }
    } catch (caught) {
      setError(
        caught instanceof NativeBridgeError
          ? caught.message
          : '사진을 불러오지 못했어요. 다시 시도해 주세요.',
      );
    } finally {
      setIsPicking(false);
    }
  };

  const addBrowserFiles = (files: FileList | null) => {
    if (!files || remainingCount === 0 || disabled) return;
    setError('');

    const nextMedia: SelectedMedia[] = [];
    for (const file of Array.from(files).slice(0, remainingCount)) {
      if (ALLOWED_IMAGE_TYPES[file.type.toLowerCase()] !== true) {
        setError('JPG, PNG, WebP 사진만 추가할 수 있어요.');
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError('장당 10MB 이하의 사진을 선택해 주세요.');
        continue;
      }

      nextMedia.push({
        id: mediaId(),
        previewUrl: URL.createObjectURL(file),
        fileName: file.name,
        mimeType: file.type,
        file,
        uploadState: 'idle',
      });
    }

    if (nextMedia.length > 0) {
      onChange([...value, ...nextMedia]);
      triggerNativeHaptic('selection');
    }
    if (libraryInputRef.current) libraryInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const removeMedia = (id: string) => {
    if (interactionDisabled || value.find((media) => media.id === id)?.pendingImageId) return;
    const target = value.find((media) => media.id === id);
    if (target?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
    onChange(value.filter((media) => media.id !== id));
    triggerNativeHaptic('selection');
  };

  const moveMedia = (index: number, delta: -1 | 1) => {
    if (disabled) return;
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= value.length) return;
    const reordered = value.slice();
    const [item] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, item);
    onChange(reordered);
    triggerNativeHaptic('selection');
  };

  return (
    <fieldset className="media-picker" disabled={disabled}>
      <legend className="form-label">{label}</legend>

      {value.length > 0 ? (
        <div className="media-preview-grid" aria-label={`선택한 사진 ${value.length}장`}>
          {value.map((media, index) => {
            const state = media.uploadState ?? (media.serverId ? 'uploaded' : 'idle');
            return (
              <div
                className={`media-preview media-preview-${state}`}
                data-upload-state={state}
                key={media.id}
              >
                <Image
                  alt={`${label} ${index + 1}`}
                  className="media-preview-image"
                  height={92}
                  src={media.previewUrl}
                  unoptimized
                  onError={() => setError('사진 링크가 만료되었거나 불러올 수 없어요. 사진을 갱신해 주세요.')}
                  width={92}
                />

                {state === 'uploading' ? (
                  <div className="media-upload-overlay" role="status">
                    <LoaderCircle className="spin" size={20} />
                    <span>업로드 중</span>
                  </div>
                ) : null}

                <button
                  aria-label={`${index + 1}번째 사진 삭제`}
                  className="media-remove-button"
                  disabled={interactionDisabled || state === 'uploading' || !!media.pendingImageId}
                  onClick={() => removeMedia(media.id)}
                  type="button"
                >
                  <X size={14} />
                </button>

                {media.id === coverId ? <span className="media-cover-badge">대표</span> : null}

                {allowReplace ? (
                  <button
                    aria-label={`${index + 1}번째 사진 교체`}
                    className="media-replace-button"
                    disabled={interactionDisabled || state === 'uploading' || !!media.pendingImageId}
                    onClick={() => {
                      replacementIdRef.current = media.id;
                      replacementInputRef.current?.click();
                    }}
                    type="button"
                  >
                    교체
                  </button>
                ) : null}

                {allowReorder && value.length > 1 ? (
                  <div className="media-order-actions">
                    <button
                      aria-label={`${index + 1}번째 사진을 앞으로 이동`}
                      disabled={disabled || state === 'uploading' || index === 0}
                      onClick={() => moveMedia(index, -1)}
                      type="button"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      aria-label={`${index + 1}번째 사진을 뒤로 이동`}
                      disabled={disabled || state === 'uploading' || index === value.length - 1}
                      onClick={() => moveMedia(index, 1)}
                      type="button"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                ) : null}

                {state === 'failed' ? (
                  <div className="media-upload-failure" role="alert">
                    <span>{media.uploadError || '업로드 실패'}</span>
                    {media.uploadErrorCode === 'UNAUTHENTICATED' ? (
                      <a href="/auth" target="_blank" rel="noreferrer">다시 로그인</a>
                    ) : null}
                    {onRetry ? (
                      <button
                        aria-label={`${index + 1}번째 사진 업로드 재시도`}
                        disabled={disabled}
                        onClick={() => onRetry(media.id)}
                        type="button"
                      >
                        <RotateCcw size={12} />
                        재시도
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {remainingCount > 0 ? (
        <div className="media-picker-actions">
          <button
            className="media-picker-button"
            disabled={interactionDisabled}
            onClick={() => void addNativeMedia('camera')}
            type="button"
          >
            {isPicking ? <LoaderCircle className="spin" size={20} /> : <Camera size={20} />}
            <span>촬영</span>
          </button>
          <button
            className="media-picker-button"
            disabled={interactionDisabled}
            onClick={() => void addNativeMedia('library')}
            type="button"
          >
            <ImagePlus size={20} />
            <span>앨범에서 선택</span>
          </button>
        </div>
      ) : null}

      <input
        ref={replacementInputRef}
        aria-label="교체할 사진 선택"
        accept="image/jpeg,image/png,image/webp"
        className="visually-hidden"
        disabled={disabled}
        onChange={(event) => replaceBrowserFile(event.target.files)}
        type="file"
      />
      <input
        ref={cameraInputRef}
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="visually-hidden"
        disabled={disabled}
        onChange={(event) => addBrowserFiles(event.target.files)}
        type="file"
      />
      <input
        ref={libraryInputRef}
        accept="image/jpeg,image/png,image/webp"
        className="visually-hidden"
        disabled={disabled}
        multiple={remainingCount > 1}
        onChange={(event) => addBrowserFiles(event.target.files)}
        type="file"
      />

      <div className="media-picker-meta">
        <span>{helper}</span>
        <strong>
          {value.length}/{maxCount}
        </strong>
      </div>
      {onRefresh ? (
        <button
          className="btn-outline"
          disabled={interactionDisabled}
          onClick={() => { setError(''); onRefresh(); }}
          type="button"
        >
          {value.some((media) => media.expiresAt && isSignedImageExpired({ expiresAt: media.expiresAt }))
            ? '만료된 사진 갱신'
            : '사진 갱신'}
        </button>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

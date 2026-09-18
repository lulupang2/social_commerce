'use client';

import Image from 'next/image';
import { Camera, ImagePlus, LoaderCircle, X } from 'lucide-react';
import React, { useRef, useState } from 'react';

import { NativeBridgeError, requestNativeMedia, triggerNativeHaptic } from '@/lib/native-bridge';

export interface SelectedMedia {
  id: string;
  previewUrl: string;
  fileName: string;
  mimeType: string;
  file?: File;
}

interface MediaPickerProps {
  label: string;
  maxCount: number;
  value: SelectedMedia[];
  onChange(value: SelectedMedia[]): void;
  helper?: string;
}

const ALLOWED_IMAGE_TYPES: Record<string, true> = {
  'image/jpeg': true,
  'image/jpg': true,
  'image/png': true,
  'image/webp': true,
  'image/heic': true,
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function mediaId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function selectedMediaToFile(media: SelectedMedia): Promise<File> {
  if (media.file) return media.file;
  const response = await fetch(media.previewUrl);
  const blob = await response.blob();
  return new File([blob], media.fileName, { type: media.mimeType });
}

export function MediaPicker({
  label,
  maxCount,
  value,
  onChange,
  helper = 'JPG, PNG, WebP · 장당 최대 10MB',
}: MediaPickerProps) {
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [error, setError] = useState('');
  const remainingCount = Math.max(0, maxCount - value.length);

  const addNativeMedia = async (source: 'camera' | 'library') => {
    if (remainingCount === 0) return;
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
        onChange([
          ...value,
          ...assets.slice(0, remainingCount).map((asset) => ({
            id: asset.id,
            previewUrl: asset.dataUrl,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
          })),
        ]);
        triggerNativeHaptic('selection');
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
    if (!files || remainingCount === 0) return;
    setError('');

    const nextMedia: SelectedMedia[] = [];
    for (const file of Array.from(files).slice(0, remainingCount)) {
      if (ALLOWED_IMAGE_TYPES[file.type.toLowerCase()] !== true) {
        setError('JPG, PNG, WebP, HEIC 사진만 추가할 수 있어요.');
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
    const target = value.find((media) => media.id === id);
    if (target?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
    onChange(value.filter((media) => media.id !== id));
    triggerNativeHaptic('selection');
  };

  return (
    <fieldset className="media-picker">
      <legend className="form-label">{label}</legend>

      {value.length > 0 ? (
        <div className="media-preview-grid" aria-label={`선택한 사진 ${value.length}장`}>
          {value.map((media, index) => (
            <div className="media-preview" key={media.id}>
              <Image
                alt={`${label} ${index + 1}`}
                className="media-preview-image"
                height={92}
                src={media.previewUrl}
                unoptimized
                width={92}
              />
              <button
                aria-label={`${index + 1}번째 사진 삭제`}
                className="media-remove-button"
                onClick={() => removeMedia(media.id)}
                type="button"
              >
                <X size={14} />
              </button>
              {index === 0 ? <span className="media-cover-badge">대표</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      {remainingCount > 0 ? (
        <div className="media-picker-actions">
          <button
            className="media-picker-button"
            disabled={isPicking}
            onClick={() => void addNativeMedia('camera')}
            type="button"
          >
            {isPicking ? <LoaderCircle className="spin" size={20} /> : <Camera size={20} />}
            <span>촬영</span>
          </button>
          <button
            className="media-picker-button"
            disabled={isPicking}
            onClick={() => void addNativeMedia('library')}
            type="button"
          >
            <ImagePlus size={20} />
            <span>앨범에서 선택</span>
          </button>
        </div>
      ) : null}

      <input
        ref={cameraInputRef}
        accept="image/jpeg,image/png,image/webp,image/heic"
        capture="environment"
        className="visually-hidden"
        onChange={(event) => addBrowserFiles(event.target.files)}
        type="file"
      />
      <input
        ref={libraryInputRef}
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="visually-hidden"
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
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

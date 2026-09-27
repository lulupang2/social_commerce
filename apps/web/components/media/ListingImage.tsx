'use client';

import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';

type ListingImageProps = Omit<ImageProps, 'src'> & { src?: ImageProps['src'] };

const placeholder = '/images/listing-placeholder.svg';

export function ListingImage({ src, alt, onError, ...props }: ListingImageProps) {
  const [failedSource, setFailedSource] = useState<ImageProps['src'] | null>(null);
  const showPlaceholder = !src || src === failedSource;

  return (
    <Image
      {...props}
      src={showPlaceholder ? placeholder : src}
      alt={showPlaceholder ? `${alt || '상품'} · 임시 이미지` : alt}
      onError={(event) => {
        if (!showPlaceholder) {
          setFailedSource(src);
          onError?.(event);
        }
      }}
    />
  );
}

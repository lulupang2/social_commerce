'use client';

import { useTranslate } from '@/lib/i18n/use-translate';
import { useLocale } from 'next-intl';

import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';

type ListingImageProps = Omit<ImageProps, 'src'> & { src?: ImageProps['src'] };

const placeholder = '/images/listing-placeholder.svg';

export function ListingImage({ src, alt, onError, ...props }: ListingImageProps) {
  const translate = useTranslate();
  const locale = useLocale();
  const [failedSource, setFailedSource] = useState<ImageProps['src'] | null>(null);
  const showPlaceholder = !src || src === failedSource;

  return (
    <Image
      {...props}
      src={showPlaceholder ? (locale === 'en' ? '/images/listing-placeholder-en.svg' : placeholder) : src}
      alt={showPlaceholder ? translate(`${alt || translate('상품')} · 임시 이미지`) : alt}
      onError={(event) => {
        if (!showPlaceholder) {
          setFailedSource(src);
          onError?.(event);
        }
      }}
    />
  );
}

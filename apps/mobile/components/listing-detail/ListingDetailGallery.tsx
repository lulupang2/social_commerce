import type { ListingImage as ListingImageData, ListingStatus, Sport } from '@icegear/domain';
import { useState } from 'react';
import {
  Dimensions,
  Image,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { sportLabels, statusLabels } from '../../lib/format';
import { getListingPlaceholderImage } from '../../lib/media/placeholders';
import { colors, radii, spacing } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { AppIcon } from '../ui/AppIcon';

export interface ListingDetailGalleryProps {
  images?: readonly ListingImageData[] | null;
  sport: Sport;
  title: string;
  status: ListingStatus;
}

const GALLERY_HEIGHT = 320;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function ListingDetailGallery({ images, sport, title, status }: ListingDetailGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedIndices, setFailedIndices] = useState<Record<number, boolean>>({});
  const [placeholderFailed, setPlaceholderFailed] = useState(false);

  const validImages = images ?? [];
  const hasImages = validImages.length > 0;
  const isUnavailable = status === 'sold' || status === 'reserved' || status === 'removed';
  const placeholderUri = getListingPlaceholderImage({ sport, title });

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const viewSize = event.nativeEvent.layoutMeasurement.width || SCREEN_WIDTH;
    const index = Math.max(0, Math.round(contentOffset / viewSize));
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  const handleImageError = (index: number) => {
    setFailedIndices((prev) => ({ ...prev, [index]: true }));
  };

  return (
    <View style={styles.container}>
      {hasImages ? (
        <View style={styles.scrollWrapper}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            style={styles.scrollView}
          >
            {validImages.map((img, idx) => {
              const uri = img.url;
              const isFailed = failedIndices[idx];

              return (
                <View key={`${uri}-${idx}`} style={styles.slide}>
                  {!isFailed ? (
                    <Image
                      accessibilityLabel={img.altText || `${title} 사진 ${idx + 1}`}
                      onError={() => handleImageError(idx)}
                      resizeMode="cover"
                      source={{ uri }}
                      style={styles.image}
                    />
                  ) : (
                    <View
                      accessibilityLabel={`${title} 사진 로드 실패`}
                      accessibilityRole="image"
                      style={styles.fallbackContainer}
                    >
                      <AppIcon color={colors.textSubtle} name="warning" size={40} />
                      <AppText style={styles.fallbackText} variant="caption">
                        이미지를 불러올 수 없습니다
                      </AppText>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {validImages.length > 1 ? (
            <View style={styles.indicatorBadge}>
              <AppText style={styles.indicatorText} variant="caption">
                {activeIndex + 1} / {validImages.length}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : !placeholderFailed ? (
        <Image
          accessibilityLabel={`${title} 대표 사진`}
          onError={() => setPlaceholderFailed(true)}
          resizeMode="cover"
          source={{ uri: placeholderUri }}
          style={styles.image}
        />
      ) : (
        <View
          accessibilityLabel={`${title} 이미지 없음`}
          accessibilityRole="image"
          style={styles.fallbackContainer}
        >
          <AppText style={styles.fallbackEmoji}>{sport === 'ski' ? '⛷' : '🏒'}</AppText>
          <AppText style={styles.fallbackText} variant="bodyStrong">
            {sportLabels[sport]} 장비
          </AppText>
        </View>
      )}

      {/* Sport Tag Overlay */}
      <View style={styles.sportBadge}>
        <AppText style={styles.sportBadgeText} variant="caption">
          {sportLabels[sport]}
        </AppText>
      </View>

      {/* Status Overlay if unavailable */}
      {isUnavailable ? (
        <View style={styles.statusOverlay}>
          <AppText style={styles.statusText} variant="label">
            {statusLabels[status]}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    height: GALLERY_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  scrollWrapper: {
    height: '100%',
    width: '100%',
  },
  scrollView: {
    height: '100%',
    width: '100%',
  },
  slide: {
    height: GALLERY_HEIGHT,
    width: SCREEN_WIDTH - 36, // accounting for screen padding
  },
  image: {
    height: '100%',
    width: '100%',
  },
  fallbackSlide: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  fallbackContainer: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  fallbackEmoji: {
    fontSize: 64,
  },
  fallbackText: {
    color: colors.textSubtle,
  },
  indicatorBadge: {
    backgroundColor: colors.scrim,
    borderRadius: radii.pill,
    bottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    right: spacing.sm,
  },
  indicatorText: {
    color: colors.textInverse,
  },
  sportBadge: {
    backgroundColor: colors.scrim,
    borderRadius: radii.pill,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    top: spacing.sm,
  },
  sportBadgeText: {
    color: colors.textInverse,
  },
  statusOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  statusText: {
    color: colors.textInverse,
    fontSize: 18,
  },
});

import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { pickImages } from '../../lib/media/picker';
import type { ValidatedMediaAsset } from '../../lib/media/types';
import { colors, radii } from '../../lib/theme';
import { AppText as Text } from '../../lib/typography';

interface PhotoPickerSectionProps {
  photos: ValidatedMediaAsset[];
  onChangePhotos: (photos: ValidatedMediaAsset[]) => void;
  maxPhotos?: number;
}

export function PhotoPickerSection({
  photos,
  onChangePhotos,
  maxPhotos = 12,
}: PhotoPickerSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  async function handlePickImages() {
    if (photos.length >= maxPhotos) {
      setError(`최대 ${maxPhotos}장의 사진만 등록할 수 있습니다.`);
      return;
    }

    setLoading(true);
    setError(null);
    setPermissionDenied(false);

    const remainingLimit = maxPhotos - photos.length;
    const result = await pickImages({ selectionLimit: remainingLimit });
    setLoading(false);

    if (!result.success) {
      if (result.error.code === 'permission_denied') {
        setPermissionDenied(true);
        setError('사진 라이브러리 접근 권한이 거부되었습니다. 설정에서 권한을 허용해 주세요.');
      } else if (result.error.code !== 'selection_canceled') {
        setError(result.error.message || '사진을 선택하지 못했습니다.');
      }
      return;
    }

    onChangePhotos([...photos, ...result.assets]);
  }

  function handleRemovePhoto(index: number) {
    const next = photos.filter((_, i) => i !== index);
    onChangePhotos(next);
    setError(null);
  }

  function handleMovePhoto(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= photos.length) return;
    const next = [...photos];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChangePhotos(next);
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>
          상품 사진{' '}
          <Text style={styles.countText}>
            ({photos.length}/{maxPhotos})
          </Text>
        </Text>
        <Text style={styles.subtext}>첫번째 사진이 대표 사진으로 설정됩니다.</Text>
      </View>

      {permissionDenied ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>사진 접근 권한 필요</Text>
          <Text style={styles.warningBody}>
            장비 사진을 첨부하려면 사진 접근 권한이 필요합니다.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="사진 접근 권한 다시 요청"
            onPress={() => void handlePickImages()}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>권한 다시 요청</Text>
          </Pressable>
        </View>
      ) : null}

      {error && !permissionDenied ? <Text style={styles.errorText}>{error}</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="사진 추가하기"
          disabled={loading || photos.length >= maxPhotos}
          onPress={() => void handlePickImages()}
          style={[
            styles.addButton,
            photos.length >= maxPhotos || loading ? styles.disabledButton : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <>
              <Text style={styles.addIcon}>+</Text>
              <Text style={styles.addText}>사진 추가</Text>
            </>
          )}
        </Pressable>

        {photos.map((item, index) => (
          <View key={`${item.uri}-${index}`} style={styles.photoCard}>
            <Image source={{ uri: item.uri }} style={styles.thumbnail} />
            {index === 0 ? (
              <View style={styles.mainBadge}>
                <Text style={styles.mainBadgeText}>대표 사진</Text>
              </View>
            ) : null}

            <View style={styles.actionsOverlay}>
              {index > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`사진 ${index + 1} 왼쪽으로 이동`}
                  onPress={() => handleMovePhoto(index, index - 1)}
                  style={styles.actionBtn}
                >
                  <Text style={styles.actionBtnText}>‹</Text>
                </Pressable>
              ) : null}
              {index < photos.length - 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`사진 ${index + 1} 오른쪽으로 이동`}
                  onPress={() => handleMovePhoto(index, index + 1)}
                  style={styles.actionBtn}
                >
                  <Text style={styles.actionBtnText}>›</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`사진 ${index + 1} 삭제`}
                onPress={() => handleRemovePhoto(index)}
                style={[styles.actionBtn, styles.removeBtn]}
              >
                <Text style={styles.removeBtnText}>✕</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  headerRow: { gap: 2 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  countText: { color: colors.accent, fontWeight: '800' },
  subtext: { color: colors.muted, fontSize: 12 },
  warningBox: {
    backgroundColor: '#FFF4E5',
    borderColor: '#FFE0B2',
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  warningTitle: { color: '#E65100', fontSize: 13, fontWeight: '800' },
  warningBody: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#E65100',
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryButtonText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  errorText: { color: colors.danger, fontSize: 12 },
  scroll: { flexDirection: 'row', paddingVertical: 4 },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    height: 100,
    justifyContent: 'center',
    marginRight: 10,
    width: 100,
  },
  disabledButton: { opacity: 0.5 },
  addIcon: { color: colors.accent, fontSize: 24, fontWeight: '700' },
  addText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  photoCard: {
    borderRadius: radii.sm,
    height: 100,
    marginRight: 10,
    overflow: 'hidden',
    position: 'relative',
    width: 100,
  },
  thumbnail: { height: '100%', width: '100%' },
  mainBadge: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: radii.xs,
    left: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: 'absolute',
    top: 0,
  },
  mainBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  actionsOverlay: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    padding: 4,
    position: 'absolute',
    right: 0,
  },
  actionBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: radii.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  actionBtnText: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  removeBtn: { backgroundColor: colors.danger },
  removeBtnText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
});

import type { Listing } from '@icegear/domain';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { categoryLabels, conditionLabels, sportLabels } from '../../lib/format';
import { colors, radii, spacing } from '../../lib/theme';
import { AppText } from '../../lib/typography';

export interface ListingAttribute {
  label: string;
  value: string;
}

type ListingAttributeGridProps = ViewProps &
  (
    | { listing: Listing; attributes?: never }
    | { listing?: never; attributes: readonly ListingAttribute[] }
  );

const detailLabels: Record<string, string> = {
  brand: '브랜드',
  model: '모델',
  year: '연식',
  size: '사이즈',
  gender: '대상',
  equipmentType: '장비 종류',
  discipline: '종목',
  lengthCm: '길이',
  waistWidthMm: '허리 폭',
  radiusM: '회전 반경',
  bootSizeMondopoint: '부츠 사이즈',
  bootFlex: '부츠 플렉스',
  bindingIncluded: '바인딩 포함',
  format: '형식',
  position: '포지션',
  handedness: '방향',
  stickFlex: '스틱 플렉스',
  stickLengthCm: '스틱 길이',
  curve: '커브',
  kickPoint: '킥 포인트',
  skateSize: '스케이트 사이즈',
  skateWidth: '스케이트 폭',
};

const valueLabels: Record<string, string> = {
  men: '남성',
  women: '여성',
  unisex: '공용',
  youth: '주니어',
  left: '왼쪽',
  right: '오른쪽',
  forward: '공격수',
  defense: '수비수',
  goalie: '골리',
  any: '무관',
  ice: '아이스',
  street: '스트리트',
  roller: '롤러',
};

export function getListingAttributes(listing: Listing): ListingAttribute[] {
  const base: ListingAttribute[] = [
    { label: '스포츠', value: sportLabels[listing.sport] },
    { label: '카테고리', value: categoryLabels[listing.category] },
    { label: '상태', value: conditionLabels[listing.condition] },
  ];

  for (const [key, rawValue] of Object.entries(listing.details)) {
    const label = detailLabels[key];
    if (!label || rawValue === undefined || rawValue === null || rawValue === '') continue;

    let value = typeof rawValue === 'boolean' ? (rawValue ? '포함' : '미포함') : String(rawValue);
    if (typeof rawValue === 'string')
      value = valueLabels[rawValue] ?? rawValue.replaceAll('_', ' ');
    if (typeof rawValue === 'number' && (key === 'lengthCm' || key === 'stickLengthCm'))
      value = `${rawValue} cm`;
    if (typeof rawValue === 'number' && key === 'waistWidthMm') value = `${rawValue} mm`;
    if (typeof rawValue === 'number' && key === 'radiusM') value = `${rawValue} m`;
    base.push({ label, value });
  }

  return base;
}

export function ListingAttributeGrid({
  listing,
  attributes,
  style,
  ...props
}: ListingAttributeGridProps) {
  const items = listing ? getListingAttributes(listing) : attributes;

  return (
    <View {...props} accessibilityLabel="상품 상세 정보" style={[styles.grid, style]}>
      {items.map((attribute) => (
        <View key={`${attribute.label}:${attribute.value}`} style={styles.cell}>
          <AppText style={styles.label} variant="caption">
            {attribute.label}
          </AppText>
          <AppText style={styles.value} variant="bodyStrong">
            {attribute.value}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: '46%',
    padding: spacing.md,
  },
  label: { color: colors.textMuted },
  value: { color: colors.text },
});

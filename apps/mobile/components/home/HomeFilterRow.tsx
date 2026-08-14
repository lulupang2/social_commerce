import { StyleSheet, View } from 'react-native';

import { spacing } from '../../lib/theme';
import { AppText } from '../../lib/typography';
import { Chip } from '../ui/Chip';

export type SportFilter = 'all' | 'ski' | 'hockey';

export interface HomeFilterRowProps {
  selectedSport: SportFilter;
  onSelectSport: (sport: SportFilter) => void;
  totalCount?: number;
}

const filterOptions: Array<{ id: SportFilter; label: string; icon?: 'filter' }> = [
  { id: 'all', label: '전체' },
  { id: 'ski', label: '⛷️ 스키' },
  { id: 'hockey', label: '🏒 아이스하키' },
];

export function HomeFilterRow({ selectedSport, onSelectSport, totalCount }: HomeFilterRowProps) {
  return (
    <View style={styles.container}>
      <View style={styles.chipGroup}>
        {filterOptions.map((option) => (
          <Chip
            key={option.id}
            accessibilityLabel={`${option.label} 상품 필터`}
            label={option.label}
            onPress={() => onSelectSport(option.id)}
            selected={selectedSport === option.id}
          />
        ))}
      </View>

      {typeof totalCount === 'number' ? (
        <AppText style={styles.countText} variant="caption">
          총 {totalCount}개
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  chipGroup: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  countText: {
    color: '#8A94A6',
  },
});

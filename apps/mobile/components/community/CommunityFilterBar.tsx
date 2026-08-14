import type { CommunityPostType, Sport } from '@icegear/domain';
import { ScrollView, StyleSheet, Pressable, View } from 'react-native';

import { communityTypeLabel } from '../../lib/community/repository';
import { sportLabels } from '../../lib/format';
import { colors, radii } from '../../lib/theme';
import { AppText as Text } from '../../lib/typography';

export type SportFilterOption = 'all' | Sport;
export type PostTypeFilterOption = 'all' | CommunityPostType;

const SPORT_FILTERS: Array<{ id: SportFilterOption; label: string }> = [
  { id: 'all', label: '전체 종목' },
  { id: 'ski', label: sportLabels.ski },
  { id: 'hockey', label: sportLabels.hockey },
];

const TYPE_FILTERS: Array<{ id: PostTypeFilterOption; label: string }> = [
  { id: 'all', label: '전체 글' },
  { id: 'discussion', label: communityTypeLabel('discussion') },
  { id: 'question', label: communityTypeLabel('question') },
  { id: 'guide', label: communityTypeLabel('guide') },
  { id: 'review', label: communityTypeLabel('review') },
  { id: 'event', label: communityTypeLabel('event') },
  { id: 'announcement', label: communityTypeLabel('announcement') },
];

interface CommunityFilterBarProps {
  selectedSport: SportFilterOption;
  onSelectSport: (sport: SportFilterOption) => void;
  selectedType: PostTypeFilterOption;
  onSelectType: (type: PostTypeFilterOption) => void;
}

export function CommunityFilterBar({
  selectedSport,
  onSelectSport,
  selectedType,
  onSelectType,
}: CommunityFilterBarProps) {
  return (
    <View style={styles.container}>
      {/* Sport filter row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        accessibilityRole="tablist"
        accessibilityLabel="스포츠 필터"
      >
        {SPORT_FILTERS.map((item) => {
          const active = selectedSport === item.id;
          return (
            <Pressable
              key={`sport-${item.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${item.label} 종목 필터`}
              onPress={() => onSelectSport(item.id)}
              style={({ pressed }) => [
                styles.sportChip,
                active && styles.sportChipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.sportChipText, active && styles.sportChipTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Post type filter row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContentSub}
        accessibilityRole="tablist"
        accessibilityLabel="게시글 유형 필터"
      >
        {TYPE_FILTERS.map((item) => {
          const active = selectedType === item.id;
          return (
            <Pressable
              key={`type-${item.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${item.label} 유형 필터`}
              onPress={() => onSelectType(item.id)}
              style={({ pressed }) => [
                styles.typeChip,
                active && styles.typeChipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: colors.surface,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 6,
  },
  scrollContentSub: {
    paddingHorizontal: 16,
    gap: 6,
    paddingTop: 2,
    paddingBottom: 4,
  },
  sportChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: colors.canvas,
  },
  sportChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  sportChipText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  sportChipTextActive: {
    color: colors.surface,
  },
  typeChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radii.sm,
    backgroundColor: '#F3F4F6',
  },
  typeChipActive: {
    backgroundColor: colors.accent,
  },
  typeChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: colors.surface,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});

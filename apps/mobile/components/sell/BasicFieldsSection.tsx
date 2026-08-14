import {
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  SPORT_LABELS,
  SPORTS,
  type ListingCategory,
  type ListingCondition,
  type Sport,
} from '@icegear/domain';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii } from '../../lib/theme';
import { AppText as Text, AppTextInput as TextInput } from '../../lib/typography';

const CATEGORY_LABELS: Record<ListingCategory, string> = {
  equipment: '장비',
  apparel: '의류',
  protective_gear: '보호장비',
  accessories: '액세서리',
  parts: '부품',
  other: '기타',
};

const CONDITION_LABELS: Record<ListingCondition, string> = {
  new: '새 상품',
  like_new: '거의 새것',
  good: '사용감 적음',
  fair: '사용감 있음',
  poor: '하점/파손 있음',
};

interface BasicFieldsSectionProps {
  sport: Sport;
  onSportChange: (sport: Sport) => void;
  title: string;
  onTitleChange: (title: string) => void;
  description: string;
  onDescriptionChange: (desc: string) => void;
  category: ListingCategory;
  onCategoryChange: (cat: ListingCategory) => void;
  condition: ListingCondition;
  onConditionChange: (cond: ListingCondition) => void;
  errors?: Record<string, string>;
}

export function BasicFieldsSection({
  sport,
  onSportChange,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  category,
  onCategoryChange,
  condition,
  onConditionChange,
  errors = {},
}: BasicFieldsSectionProps) {
  return (
    <View style={styles.container}>
      <View style={styles.field}>
        <Text style={styles.label}>
          스포츠 종목 <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.choiceRow}>
          {SPORTS.map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={`종목 ${SPORT_LABELS[s]} 선택`}
              onPress={() => onSportChange(s)}
              style={[styles.sportCard, sport === s ? styles.sportCardSelected : null]}
            >
              <Text
                style={[styles.sportCardText, sport === s ? styles.sportCardTextSelected : null]}
              >
                {s === 'ski' ? '⛷️ 스키' : '🏒 아이스하키'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>종목 변경 시 입력 중이던 상세 사양이 초기화됩니다.</Text>
      </View>

      <View style={styles.field}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>
            제목 <Text style={styles.required}>*</Text>
          </Text>
          <Text style={styles.charCounter}>{title.length}/120</Text>
        </View>
        <TextInput
          accessibilityLabel="글 제목 입력"
          maxLength={120}
          onChangeText={onTitleChange}
          placeholder="예: Rossignol Hero Elite 165cm 스키"
          style={[styles.input, errors.title ? styles.inputError : null]}
          value={title}
        />
        {errors.title ? <Text style={styles.errorText}>{errors.title}</Text> : null}
      </View>

      <View style={styles.field}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>
            상품 설명 <Text style={styles.required}>*</Text>
          </Text>
          <Text style={styles.charCounter}>{description.length}/5000</Text>
        </View>
        <TextInput
          accessibilityLabel="상품 설명 입력"
          maxLength={5000}
          multiline
          onChangeText={onDescriptionChange}
          placeholder="사용 기간, 상태, 구성품, 직거래 선호 위치 등을 자세히 작성해 주세요."
          style={[
            styles.input,
            styles.multilineInput,
            errors.description ? styles.inputError : null,
          ]}
          value={description}
        />
        {errors.description ? <Text style={styles.errorText}>{errors.description}</Text> : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>
          카테고리 <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.choiceWrap}>
          {LISTING_CATEGORIES.map((cat) => (
            <Pressable
              key={cat}
              accessibilityRole="button"
              accessibilityLabel={`카테고리 ${CATEGORY_LABELS[cat]} 선택`}
              onPress={() => onCategoryChange(cat)}
              style={[styles.chip, category === cat ? styles.chipSelected : null]}
            >
              <Text style={[styles.chipText, category === cat ? styles.chipTextSelected : null]}>
                {CATEGORY_LABELS[cat]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>
          상품 상태 <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.choiceWrap}>
          {LISTING_CONDITIONS.map((cond) => (
            <Pressable
              key={cond}
              accessibilityRole="button"
              accessibilityLabel={`상태 ${CONDITION_LABELS[cond]} 선택`}
              onPress={() => onConditionChange(cond)}
              style={[styles.chip, condition === cond ? styles.chipSelected : null]}
            >
              <Text style={[styles.chipText, condition === cond ? styles.chipTextSelected : null]}>
                {CONDITION_LABELS[cond]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  required: { color: colors.accent, fontWeight: '800' },
  charCounter: { color: colors.muted, fontSize: 12 },
  hint: { color: colors.muted, fontSize: 11, marginTop: 2 },
  choiceRow: { flexDirection: 'row', gap: 10 },
  sportCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  sportCardSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  sportCardText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  sportCardTextSelected: { color: colors.surface },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multilineInput: { minHeight: 110, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 12 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  chipTextSelected: { color: colors.surface },
});

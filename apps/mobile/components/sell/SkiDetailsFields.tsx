import {
  GENDERS,
  SKI_DISCIPLINES,
  SKI_EQUIPMENT_TYPES,
  SKILL_LEVELS,
  type Gender,
  type SkiDiscipline,
  type SkiEquipmentType,
  type SkillLevel,
} from '@icegear/domain';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii } from '../../lib/theme';
import { AppText as Text, AppTextInput as TextInput } from '../../lib/typography';
import type { SkiDetailsState } from './types';

const SKI_EQUIPMENT_LABELS: Record<SkiEquipmentType, string> = {
  skis: '스키판',
  boots: '부츠',
  bindings: '바인딩',
  poles: '폴',
  helmet: '헬멧',
  goggles: '고글',
  jacket: '상의',
  pants: '하의',
  gloves: '장갑',
  bag: '가방',
  other: '기타',
};

const SKI_DISCIPLINE_LABELS: Record<SkiDiscipline, string> = {
  alpine: '알파인',
  cross_country: '크로스컨트리',
  freeride: '프리라이드',
  freestyle: '프리스타일',
  touring: '투어링',
  telemark: '텔레마크',
  other: '기타',
};

const GENDER_LABELS: Record<Gender, string> = {
  men: '남성용',
  women: '여성용',
  unisex: '남녀공용',
  youth: '주니어/유아',
};

const SKILL_LABELS: Record<SkillLevel, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '상급',
  expert: '최상급/선수',
};

interface SkiDetailsFieldsProps {
  value: SkiDetailsState;
  onChange: (next: SkiDetailsState) => void;
  errors?: Record<string, string>;
}

export function SkiDetailsFields({ value, onChange, errors = {} }: SkiDetailsFieldsProps) {
  function update<K extends keyof SkiDetailsState>(field: K, val: SkiDetailsState[K]) {
    onChange({ ...value, [field]: val });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>⛷️ 스키 세부 사양 (선택)</Text>

      {/* 장비 종류 */}
      <View style={styles.field}>
        <Text style={styles.label}>장비 종류</Text>
        <View style={styles.choiceWrap}>
          {SKI_EQUIPMENT_TYPES.map((type) => (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityLabel={`장비 종류 ${SKI_EQUIPMENT_LABELS[type]} 선택`}
              onPress={() => update('equipmentType', value.equipmentType === type ? '' : type)}
              style={[styles.chip, value.equipmentType === type ? styles.chipSelected : null]}
            >
              <Text
                style={[
                  styles.chipText,
                  value.equipmentType === type ? styles.chipTextSelected : null,
                ]}
              >
                {SKI_EQUIPMENT_LABELS[type]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 종목 분야 */}
      <View style={styles.field}>
        <Text style={styles.label}>종목 스타일</Text>
        <View style={styles.choiceWrap}>
          {SKI_DISCIPLINES.map((disc) => (
            <Pressable
              key={disc}
              accessibilityRole="button"
              accessibilityLabel={`종목 스타일 ${SKI_DISCIPLINE_LABELS[disc]} 선택`}
              onPress={() => update('discipline', value.discipline === disc ? '' : disc)}
              style={[styles.chip, value.discipline === disc ? styles.chipSelected : null]}
            >
              <Text
                style={[
                  styles.chipText,
                  value.discipline === disc ? styles.chipTextSelected : null,
                ]}
              >
                {SKI_DISCIPLINE_LABELS[disc]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 브랜드 / 모델 */}
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Text style={styles.label}>브랜드</Text>
          <TextInput
            accessibilityLabel="브랜드 입력"
            onChangeText={(v) => update('brand', v)}
            placeholder="예: Salomon"
            style={styles.input}
            value={value.brand}
          />
        </View>
        <View style={styles.rowItem}>
          <Text style={styles.label}>모델명</Text>
          <TextInput
            accessibilityLabel="모델명 입력"
            onChangeText={(v) => update('model', v)}
            placeholder="예: S/Race GS"
            style={styles.input}
            value={value.model}
          />
        </View>
      </View>

      {/* 연식 / 사이즈 */}
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Text style={styles.label}>연식 (시즌)</Text>
          <TextInput
            accessibilityLabel="연식 입력"
            keyboardType="numeric"
            onChangeText={(v) => update('year', v)}
            placeholder="예: 2023"
            style={[styles.input, errors.year ? styles.inputError : null]}
            value={value.year}
          />
          {errors.year ? <Text style={styles.errorText}>{errors.year}</Text> : null}
        </View>
        <View style={styles.rowItem}>
          <Text style={styles.label}>사이즈</Text>
          <TextInput
            accessibilityLabel="사이즈 입력"
            onChangeText={(v) => update('size', v)}
            placeholder="예: M / 170cm"
            style={styles.input}
            value={value.size}
          />
        </View>
      </View>

      {/* 플레이트 사양 (길이/허리폭/회전반경) */}
      <Text style={styles.subHeader}>플레이트 치수</Text>
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Text style={styles.label}>길이 (cm)</Text>
          <TextInput
            accessibilityLabel="스키 길이 입력"
            keyboardType="decimal-pad"
            onChangeText={(v) => update('lengthCm', v)}
            placeholder="예: 165"
            style={[styles.input, errors.lengthCm ? styles.inputError : null]}
            value={value.lengthCm}
          />
          {errors.lengthCm ? <Text style={styles.errorText}>{errors.lengthCm}</Text> : null}
        </View>
        <View style={styles.rowItem}>
          <Text style={styles.label}>허리폭 (mm)</Text>
          <TextInput
            accessibilityLabel="허리폭 입력"
            keyboardType="decimal-pad"
            onChangeText={(v) => update('waistWidthMm', v)}
            placeholder="예: 68"
            style={[styles.input, errors.waistWidthMm ? styles.inputError : null]}
            value={value.waistWidthMm}
          />
          {errors.waistWidthMm ? <Text style={styles.errorText}>{errors.waistWidthMm}</Text> : null}
        </View>
        <View style={styles.rowItem}>
          <Text style={styles.label}>회전반경 (m)</Text>
          <TextInput
            accessibilityLabel="회전반경 입력"
            keyboardType="decimal-pad"
            onChangeText={(v) => update('radiusM', v)}
            placeholder="예: 13"
            style={[styles.input, errors.radiusM ? styles.inputError : null]}
            value={value.radiusM}
          />
          {errors.radiusM ? <Text style={styles.errorText}>{errors.radiusM}</Text> : null}
        </View>
      </View>

      {/* 부츠 사양 */}
      <Text style={styles.subHeader}>부츠 사양</Text>
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Text style={styles.label}>몬도포인트 (mm)</Text>
          <TextInput
            accessibilityLabel="부츠 몬도포인트 입력"
            keyboardType="numeric"
            onChangeText={(v) => update('bootMondopointMm', v)}
            placeholder="예: 265"
            style={[styles.input, errors.bootMondopointMm ? styles.inputError : null]}
            value={value.bootMondopointMm}
          />
          {errors.bootMondopointMm ? (
            <Text style={styles.errorText}>{errors.bootMondopointMm}</Text>
          ) : null}
        </View>
        <View style={styles.rowItem}>
          <Text style={styles.label}>부츠 플렉스</Text>
          <TextInput
            accessibilityLabel="부츠 플렉스 입력"
            keyboardType="numeric"
            onChangeText={(v) => update('bootFlex', v)}
            placeholder="예: 110"
            style={[styles.input, errors.bootFlex ? styles.inputError : null]}
            value={value.bootFlex}
          />
          {errors.bootFlex ? <Text style={styles.errorText}>{errors.bootFlex}</Text> : null}
        </View>
      </View>

      {/* 바인딩 포함 여부 */}
      <View style={styles.field}>
        <Text style={styles.label}>바인딩 포함 여부</Text>
        <View style={styles.choiceWrap}>
          {[
            { label: '포함', val: true },
            { label: '미포함', val: false },
            { label: '선택 안 함', val: null },
          ].map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={`바인딩 ${item.label} 선택`}
              onPress={() => update('bindingIncluded', item.val)}
              style={[styles.chip, value.bindingIncluded === item.val ? styles.chipSelected : null]}
            >
              <Text
                style={[
                  styles.chipText,
                  value.bindingIncluded === item.val ? styles.chipTextSelected : null,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 성별 / 숙련도 */}
      <View style={styles.field}>
        <Text style={styles.label}>대상 성별/연령</Text>
        <View style={styles.choiceWrap}>
          {GENDERS.map((g) => (
            <Pressable
              key={g}
              accessibilityRole="button"
              accessibilityLabel={`성별 ${GENDER_LABELS[g]} 선택`}
              onPress={() => update('gender', value.gender === g ? '' : g)}
              style={[styles.chip, value.gender === g ? styles.chipSelected : null]}
            >
              <Text style={[styles.chipText, value.gender === g ? styles.chipTextSelected : null]}>
                {GENDER_LABELS[g]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>권장 숙련도</Text>
        <View style={styles.choiceWrap}>
          {SKILL_LEVELS.map((sk) => (
            <Pressable
              key={sk}
              accessibilityRole="button"
              accessibilityLabel={`숙련도 ${SKILL_LABELS[sk]} 선택`}
              onPress={() => update('skillLevel', value.skillLevel === sk ? '' : sk)}
              style={[styles.chip, value.skillLevel === sk ? styles.chipSelected : null]}
            >
              <Text
                style={[styles.chipText, value.skillLevel === sk ? styles.chipTextSelected : null]}
              >
                {SKILL_LABELS[sk]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 메모 */}
      <View style={styles.field}>
        <Text style={styles.label}>추가 참고 메모</Text>
        <TextInput
          accessibilityLabel="추가 메모 입력"
          multiline
          onChangeText={(v) => update('notes', v)}
          placeholder="특이사항, 튜닝/세팅 정보, 왁싱 상태 등"
          style={[styles.input, styles.multilineInput]}
          value={value.notes}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  sectionHeader: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  subHeader: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 4 },
  field: { gap: 6 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10 },
  rowItem: { flex: 1, gap: 6 },
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
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 12 },
  multilineInput: { minHeight: 80, textAlignVertical: 'top' },
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

import {
  GENDERS,
  HANDEDNESSES,
  HOCKEY_EQUIPMENT_TYPES,
  HOCKEY_FORMATS,
  HOCKEY_POSITIONS,
  SKILL_LEVELS,
  type Gender,
  type Handedness,
  type HockeyEquipmentType,
  type HockeyFormat,
  type HockeyPosition,
  type SkillLevel,
} from '@icegear/domain';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii } from '../../lib/theme';
import { AppText as Text, AppTextInput as TextInput } from '../../lib/typography';
import type { HockeyDetailsState } from './types';

const HOCKEY_EQUIPMENT_LABELS: Record<HockeyEquipmentType, string> = {
  stick: '스틱',
  skates: '스케이트',
  helmet: '헬멧',
  gloves: '글러브',
  shoulder_pads: '상체보호대',
  elbow_pads: '팔꿈치보호대',
  shin_guards: '정강이보호대',
  pants: '하키팬츠',
  jersey: '유니폼/저지',
  bag: '가방',
  goalie_gear: '골리 장비',
  other: '기타',
};

const HOCKEY_FORMAT_LABELS: Record<HockeyFormat, string> = {
  ice: '아이스하키',
  street: '스트리트',
  roller: '롤러하키',
  other: '기타',
};

const HOCKEY_POSITION_LABELS: Record<HockeyPosition, string> = {
  forward: '포워드',
  defense: '디펜스',
  goalie: '골리',
  any: '공용/포지션 무관',
};

const HANDEDNESS_LABELS: Record<Handedness, string> = {
  left: 'Left (왼손잡이)',
  right: 'Right (오른손잡이)',
};

const GENDER_LABELS: Record<Gender, string> = {
  men: '성인 남성용',
  women: '성인 여성용',
  unisex: '남녀공용',
  youth: '유스/주니어',
};

const SKILL_LABELS: Record<SkillLevel, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '상급',
  expert: '최상급/선수',
};

interface HockeyDetailsFieldsProps {
  value: HockeyDetailsState;
  onChange: (next: HockeyDetailsState) => void;
  errors?: Record<string, string>;
}

export function HockeyDetailsFields({ value, onChange, errors = {} }: HockeyDetailsFieldsProps) {
  function update<K extends keyof HockeyDetailsState>(field: K, val: HockeyDetailsState[K]) {
    onChange({ ...value, [field]: val });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>🏒 아이스하키 세부 사양 (선택)</Text>

      {/* 장비 종류 */}
      <View style={styles.field}>
        <Text style={styles.label}>장비 종류</Text>
        <View style={styles.choiceWrap}>
          {HOCKEY_EQUIPMENT_TYPES.map((type) => (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityLabel={`장비 종류 ${HOCKEY_EQUIPMENT_LABELS[type]} 선택`}
              onPress={() => update('equipmentType', value.equipmentType === type ? '' : type)}
              style={[styles.chip, value.equipmentType === type ? styles.chipSelected : null]}
            >
              <Text
                style={[
                  styles.chipText,
                  value.equipmentType === type ? styles.chipTextSelected : null,
                ]}
              >
                {HOCKEY_EQUIPMENT_LABELS[type]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 형태 / 포지션 */}
      <View style={styles.field}>
        <Text style={styles.label}>경기 방식/형태</Text>
        <View style={styles.choiceWrap}>
          {HOCKEY_FORMATS.map((fmt) => (
            <Pressable
              key={fmt}
              accessibilityRole="button"
              accessibilityLabel={`경기 방식 ${HOCKEY_FORMAT_LABELS[fmt]} 선택`}
              onPress={() => update('format', value.format === fmt ? '' : fmt)}
              style={[styles.chip, value.format === fmt ? styles.chipSelected : null]}
            >
              <Text
                style={[styles.chipText, value.format === fmt ? styles.chipTextSelected : null]}
              >
                {HOCKEY_FORMAT_LABELS[fmt]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>포지션</Text>
        <View style={styles.choiceWrap}>
          {HOCKEY_POSITIONS.map((pos) => (
            <Pressable
              key={pos}
              accessibilityRole="button"
              accessibilityLabel={`포지션 ${HOCKEY_POSITION_LABELS[pos]} 선택`}
              onPress={() => update('position', value.position === pos ? '' : pos)}
              style={[styles.chip, value.position === pos ? styles.chipSelected : null]}
            >
              <Text
                style={[styles.chipText, value.position === pos ? styles.chipTextSelected : null]}
              >
                {HOCKEY_POSITION_LABELS[pos]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 핸디드니스 */}
      <View style={styles.field}>
        <Text style={styles.label}>방향 (Handedness)</Text>
        <View style={styles.choiceWrap}>
          {HANDEDNESSES.map((h) => (
            <Pressable
              key={h}
              accessibilityRole="button"
              accessibilityLabel={`방향 ${HANDEDNESS_LABELS[h]} 선택`}
              onPress={() => update('handedness', value.handedness === h ? '' : h)}
              style={[styles.chip, value.handedness === h ? styles.chipSelected : null]}
            >
              <Text
                style={[styles.chipText, value.handedness === h ? styles.chipTextSelected : null]}
              >
                {HANDEDNESS_LABELS[h]}
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
            placeholder="예: Bauer / CCM"
            style={styles.input}
            value={value.brand}
          />
        </View>
        <View style={styles.rowItem}>
          <Text style={styles.label}>모델명</Text>
          <TextInput
            accessibilityLabel="모델명 입력"
            onChangeText={(v) => update('model', v)}
            placeholder="예: Vapor Hyperlite"
            style={styles.input}
            value={value.model}
          />
        </View>
      </View>

      {/* 연식 / 사이즈 */}
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Text style={styles.label}>연식</Text>
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
            placeholder="예: Senior M"
            style={styles.input}
            value={value.size}
          />
        </View>
      </View>

      {/* 스틱 관련 (플렉스/스틱길이/커브/킥포인트) */}
      <Text style={styles.subHeader}>스틱 상세</Text>
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Text style={styles.label}>플렉스 (Flex)</Text>
          <TextInput
            accessibilityLabel="스틱 플렉스 입력"
            keyboardType="numeric"
            onChangeText={(v) => update('stickFlex', v)}
            placeholder="예: 77"
            style={[styles.input, errors.stickFlex ? styles.inputError : null]}
            value={value.stickFlex}
          />
          {errors.stickFlex ? <Text style={styles.errorText}>{errors.stickFlex}</Text> : null}
        </View>
        <View style={styles.rowItem}>
          <Text style={styles.label}>스틱 길이 (cm)</Text>
          <TextInput
            accessibilityLabel="스틱 길이 입력"
            keyboardType="decimal-pad"
            onChangeText={(v) => update('stickLengthCm', v)}
            placeholder="예: 155"
            style={[styles.input, errors.stickLengthCm ? styles.inputError : null]}
            value={value.stickLengthCm}
          />
          {errors.stickLengthCm ? (
            <Text style={styles.errorText}>{errors.stickLengthCm}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Text style={styles.label}>커브 패턴</Text>
          <TextInput
            accessibilityLabel="커브 패턴 입력"
            onChangeText={(v) => update('curve', v)}
            placeholder="예: P29 / P88"
            style={styles.input}
            value={value.curve}
          />
        </View>
        <View style={styles.rowItem}>
          <Text style={styles.label}>킥 포인트</Text>
          <TextInput
            accessibilityLabel="킥 포인트 입력"
            onChangeText={(v) => update('kickPoint', v)}
            placeholder="예: Low / Mid"
            style={styles.input}
            value={value.kickPoint}
          />
        </View>
      </View>

      {/* 스케이트 관련 (사이즈/발볼) */}
      <Text style={styles.subHeader}>스케이트 상세</Text>
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Text style={styles.label}>스케이트 치수</Text>
          <TextInput
            accessibilityLabel="스케이트 치수 입력"
            keyboardType="decimal-pad"
            onChangeText={(v) => update('skateSize', v)}
            placeholder="예: 7.5"
            style={[styles.input, errors.skateSize ? styles.inputError : null]}
            value={value.skateSize}
          />
          {errors.skateSize ? <Text style={styles.errorText}>{errors.skateSize}</Text> : null}
        </View>
        <View style={styles.rowItem}>
          <Text style={styles.label}>발볼 넓이 (Fit)</Text>
          <TextInput
            accessibilityLabel="발볼 넓이 입력"
            onChangeText={(v) => update('skateWidth', v)}
            placeholder="예: Fit 2 / D / EE"
            style={styles.input}
            value={value.skateWidth}
          />
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
          placeholder="날 연마 상태, 사용 횟수, 특이사항 등"
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

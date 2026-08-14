import { useEffect, useMemo, useState } from 'react';
import type {
  ApparelSize,
  ProfileSizePreferences,
  ProfileSportPreference,
  ProtectiveGearSize,
  SkillLevel,
  Sport,
} from '@icegear/domain';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  completeCurrentProfileOnboarding,
  updateCurrentProfile,
  type CurrentProfile,
} from '../../lib/profile/repository';
import { colors, interaction, radii, spacing } from '../../lib/theme';
import { AppText as Text, AppTextInput as TextInput, fontFamilies } from '../../lib/typography';
import { Button, Chip } from '../ui';

export type ProfileEditorMode = 'onboarding' | 'edit';

export interface ProfileEditorProps {
  mode: ProfileEditorMode;
  profile: CurrentProfile;
  onCancel?: () => void;
  onSaved(profile: CurrentProfile): void;
}

type SportDraft = {
  selected: boolean;
  skillLevel: SkillLevel | null;
  footLengthMm: string;
  bootMondopointMm: string;
  skiLengthCm: string;
  skateSize: string;
  skateWidth: string;
  apparelSize: ApparelSize | '';
  protectiveGearSize: ProtectiveGearSize | '';
};

const SPORT_CATALOG: Record<Sport, { id: string; label: string; note: string }> = {
  ski: {
    id: '11111111-1111-4111-8111-111111111111',
    label: '스키',
    note: '스키·부츠 길이를 추천에 활용해요.',
  },
  hockey: {
    id: '22222222-2222-4222-8222-222222222222',
    label: '아이스하키',
    note: '스케이트·보호 장비 사이즈를 저장해요.',
  },
};

const SKILLS: Array<{ value: SkillLevel; label: string }> = [
  { value: 'beginner', label: '입문' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '상급' },
  { value: 'expert', label: '전문' },
];

const APPAREL_SIZES: ApparelSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
const PROTECTIVE_SIZES: Array<{ value: ProtectiveGearSize; label: string }> = [
  { value: 'youth', label: '유스' },
  { value: 'junior', label: '주니어' },
  { value: 'senior_s', label: '시니어 S' },
  { value: 'senior_m', label: '시니어 M' },
  { value: 'senior_l', label: '시니어 L' },
];

function numericText(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function initialSportDraft(profile: CurrentProfile, sport: Sport): SportDraft {
  const preference = profile.sports.find((item) => item.sport === sport);
  const sizes = preference?.sizePreferences ?? undefined;
  return {
    selected: Boolean(preference),
    skillLevel: preference?.skillLevel ?? null,
    footLengthMm: numericText(sizes?.footLengthMm),
    bootMondopointMm: numericText(sizes?.bootMondopointMm),
    skiLengthCm: numericText(sizes?.skiLengthCm),
    skateSize: numericText(sizes?.skateSize),
    skateWidth: sizes?.skateWidth ?? '',
    apparelSize: sizes?.apparelSize ?? '',
    protectiveGearSize: sizes?.protectiveGearSize ?? '',
  };
}

function integerValue(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const number = Number(normalized);
  return Number.isInteger(number) ? number : Number.NaN;
}

function decimalValue(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : Number.NaN;
}

function toPreference(sport: Sport, draft: SportDraft): ProfileSportPreference {
  const sizePreferences: ProfileSizePreferences =
    sport === 'ski'
      ? {
          footLengthMm: integerValue(draft.footLengthMm),
          bootMondopointMm: integerValue(draft.bootMondopointMm),
          skiLengthCm: integerValue(draft.skiLengthCm),
          apparelSize: draft.apparelSize || undefined,
        }
      : {
          footLengthMm: integerValue(draft.footLengthMm),
          skateSize: decimalValue(draft.skateSize),
          skateWidth: draft.skateWidth.trim() || undefined,
          apparelSize: draft.apparelSize || undefined,
          protectiveGearSize: draft.protectiveGearSize || undefined,
        };

  return {
    sportId: SPORT_CATALOG[sport].id,
    skillLevel: draft.skillLevel,
    sizePreferences: Object.keys(sizePreferences).length > 0 ? sizePreferences : null,
  };
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  helper,
  keyboardType,
  multiline,
  autoCapitalize = 'sentences',
}: {
  label: string;
  value: string;
  onChangeText(value: string): void;
  placeholder: string;
  helper?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        returnKeyType={multiline ? 'default' : 'next'}
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
      />
      {helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
    </View>
  );
}

function SportPreferences({
  sport,
  value,
  onChange,
}: {
  sport: Sport;
  value: SportDraft;
  onChange(value: SportDraft): void;
}) {
  const catalog = SPORT_CATALOG[sport];
  return (
    <View style={[styles.sportCard, value.selected && styles.sportCardSelected]}>
      <Pressable
        accessibilityLabel={`${catalog.label} 선호 스포츠`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: value.selected }}
        onPress={() => onChange({ ...value, selected: !value.selected })}
        style={styles.sportToggle}
      >
        <View style={[styles.checkBox, value.selected && styles.checkBoxSelected]}>
          {value.selected ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
        <View style={styles.sportCopy}>
          <Text style={styles.sportTitle}>{catalog.label}</Text>
          <Text style={styles.sportNote}>{catalog.note}</Text>
        </View>
      </Pressable>

      {value.selected ? (
        <View style={styles.sportDetails}>
          <Text style={styles.groupLabel}>실력</Text>
          <View style={styles.chips}>
            {SKILLS.map((skill) => (
              <Chip
                key={skill.value}
                accessibilityLabel={`${catalog.label} 실력 ${skill.label}`}
                label={skill.label}
                onPress={() => onChange({ ...value, skillLevel: skill.value })}
                selected={value.skillLevel === skill.value}
              />
            ))}
          </View>

          <Text style={styles.optionalLabel}>선택 사이즈 · 비워도 저장할 수 있어요</Text>
          <View style={styles.compactFields}>
            <Field
              keyboardType="numeric"
              label="발 길이 (mm)"
              onChangeText={(footLengthMm) => onChange({ ...value, footLengthMm })}
              placeholder="예: 255"
              value={value.footLengthMm}
            />
            {sport === 'ski' ? (
              <>
                <Field
                  keyboardType="numeric"
                  label="부츠 몬도포인트 (mm)"
                  onChangeText={(bootMondopointMm) => onChange({ ...value, bootMondopointMm })}
                  placeholder="예: 255"
                  value={value.bootMondopointMm}
                />
                <Field
                  keyboardType="numeric"
                  label="선호 스키 길이 (cm)"
                  onChangeText={(skiLengthCm) => onChange({ ...value, skiLengthCm })}
                  placeholder="예: 168"
                  value={value.skiLengthCm}
                />
              </>
            ) : (
              <>
                <Field
                  keyboardType="decimal-pad"
                  label="스케이트 사이즈"
                  onChangeText={(skateSize) => onChange({ ...value, skateSize })}
                  placeholder="예: 7.5"
                  value={value.skateSize}
                />
                <Field
                  label="스케이트 폭"
                  onChangeText={(skateWidth) => onChange({ ...value, skateWidth })}
                  placeholder="예: D, EE"
                  value={value.skateWidth}
                />
              </>
            )}
          </View>

          <Text style={styles.groupLabel}>의류 사이즈</Text>
          <View style={styles.chips}>
            {APPAREL_SIZES.map((size) => (
              <Chip
                key={size}
                accessibilityLabel={`${catalog.label} 의류 사이즈 ${size}`}
                label={size}
                onPress={() =>
                  onChange({ ...value, apparelSize: value.apparelSize === size ? '' : size })
                }
                selected={value.apparelSize === size}
              />
            ))}
          </View>

          {sport === 'hockey' ? (
            <>
              <Text style={styles.groupLabel}>보호 장비 사이즈</Text>
              <View style={styles.chips}>
                {PROTECTIVE_SIZES.map((size) => (
                  <Chip
                    key={size.value}
                    accessibilityLabel={`아이스하키 보호 장비 사이즈 ${size.label}`}
                    label={size.label}
                    onPress={() =>
                      onChange({
                        ...value,
                        protectiveGearSize:
                          value.protectiveGearSize === size.value ? '' : size.value,
                      })
                    }
                    selected={value.protectiveGearSize === size.value}
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function ProfileEditor({ mode, profile, onCancel, onSaved }: ProfileEditorProps) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [sports, setSports] = useState<Record<Sport, SportDraft>>({
    ski: initialSportDraft(profile, 'ski'),
    hockey: initialSportDraft(profile, 'hockey'),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile.displayName ?? '');
    setUsername(profile.username ?? '');
    setBio(profile.bio ?? '');
    setSports({
      ski: initialSportDraft(profile, 'ski'),
      hockey: initialSportDraft(profile, 'hockey'),
    });
  }, [profile]);

  const selectedSports = useMemo(
    () => (Object.keys(SPORT_CATALOG) as Sport[]).filter((sport) => sports[sport].selected),
    [sports],
  );

  async function save() {
    setError(null);
    if (!displayName.trim()) {
      setError('표시 이름을 입력해 주세요.');
      return;
    }
    if (selectedSports.length === 0) {
      setError('즐기는 스포츠를 하나 이상 선택해 주세요.');
      return;
    }
    const missingSkill = selectedSports.find((sport) => sports[sport].skillLevel === null);
    if (missingSkill) {
      setError(`${SPORT_CATALOG[missingSkill].label} 실력을 선택해 주세요.`);
      return;
    }
    const normalizedUsername = username.trim().toLowerCase();
    if (normalizedUsername && !/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      setError('사용자 이름은 영문 소문자, 숫자, 밑줄로 3–30자 입력해 주세요.');
      return;
    }

    const preferences = selectedSports.map((sport) => toPreference(sport, sports[sport]));
    setSaving(true);
    const result =
      mode === 'onboarding'
        ? await completeCurrentProfileOnboarding({
            displayName: displayName.trim(),
            username: normalizedUsername || undefined,
            bio: bio.trim() || undefined,
            sports: preferences,
          })
        : await updateCurrentProfile({
            displayName: displayName.trim(),
            username: normalizedUsername || null,
            bio: bio.trim() || null,
            sports: preferences,
          });
    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }
    onSaved(result.data);
  }

  return (
    <View style={styles.editor}>
      <View style={styles.intro}>
        <Text style={styles.kicker}>
          {mode === 'onboarding' ? 'SET UP YOUR LOCKER' : 'EDIT YOUR LOCKER'}
        </Text>
        <Text style={styles.title}>
          {mode === 'onboarding' ? '내 장비함을 먼저 맞춰볼까요?' : '프로필과 선호 장비를 수정해요'}
        </Text>
        <Text style={styles.body}>
          스포츠와 실력은 장비 탐색에 사용하고, 사이즈는 선택한 값만 계정에 저장해요.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>기본 정보</Text>
        <Field
          label="표시 이름"
          onChangeText={setDisplayName}
          placeholder="앱에서 보여줄 이름"
          value={displayName}
        />
        <Field
          autoCapitalize="none"
          helper="영문 소문자, 숫자, 밑줄 3–30자"
          label="사용자 이름 · 선택"
          onChangeText={setUsername}
          placeholder="icegear_rider"
          value={username}
        />
        <Field
          helper={`${bio.length}/500`}
          label="소개 · 선택"
          multiline
          onChangeText={(value) => setBio(value.slice(0, 500))}
          placeholder="즐기는 종목이나 찾는 장비를 적어보세요."
          value={bio}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>선호 스포츠</Text>
        <Text style={styles.sectionHint}>하나 이상 선택해 주세요.</Text>
        {(Object.keys(SPORT_CATALOG) as Sport[]).map((sport) => (
          <SportPreferences
            key={sport}
            onChange={(value) => setSports((current) => ({ ...current, [sport]: value }))}
            sport={sport}
            value={sports[sport]}
          />
        ))}
      </View>

      {error ? (
        <View
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={styles.errorCard}
        >
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          fullWidth
          label={mode === 'onboarding' ? '프로필 완성하기' : '변경사항 저장'}
          loading={saving}
          onPress={() => void save()}
          size="large"
          variant="accent"
        />
        {onCancel ? (
          <Button disabled={saving} fullWidth label="취소" onPress={onCancel} variant="ghost" />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { gap: spacing.xxl },
  intro: { gap: spacing.sm },
  kicker: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 13,
    letterSpacing: 1.4,
  },
  title: {
    color: colors.text,
    fontFamily: fontFamilies.displayExtraBold,
    fontSize: 27,
    lineHeight: 35,
  },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 23 },
  section: { gap: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 18, lineHeight: 25, fontWeight: '800' },
  sectionHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: -spacing.sm },
  field: { gap: spacing.xs },
  fieldLabel: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  fieldHelper: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: interaction.controlHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  multilineInput: { minHeight: 108, textAlignVertical: 'top' },
  sportCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sportCardSelected: { borderColor: colors.primary },
  sportToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  checkBox: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radii.xs,
    borderWidth: 1.5,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkBoxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: colors.textInverse, fontSize: 15, fontWeight: '800' },
  sportCopy: { flex: 1, gap: spacing.xs, marginLeft: spacing.md },
  sportTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  sportNote: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  sportDetails: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  groupLabel: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  optionalLabel: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  compactFields: { gap: spacing.md },
  errorCard: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.lg,
  },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 21, fontWeight: '700' },
  actions: { gap: spacing.sm },
});

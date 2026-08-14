import { createListingSchema, type CreateListingPayload } from '@icegear/domain';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { listingRepository, type ListingRepositoryError } from '../lib/listings/repository';
import { isSupabaseConfigured } from '../lib/supabase/client';
import { colors, radii } from '../lib/theme';
import { AppText as Text, AppTextInput as TextInput, fontFamilies } from '../lib/typography';

type FormValues = {
  sport: string;
  title: string;
  description: string;
  category: string;
  condition: string;
  price: string;
  currency: string;
  location: string;
  brand: string;
  model: string;
  size: string;
};

const initialValues: FormValues = {
  sport: 'ski',
  title: '',
  description: '',
  category: 'equipment',
  condition: 'good',
  price: '',
  currency: 'KRW',
  location: '',
  brand: '',
  model: '',
  size: '',
};

function formatIssue(error: ListingRepositoryError): string {
  if (!error.fieldErrors) return error.message;
  return [
    error.message,
    ...Object.entries(error.fieldErrors).map(([field, message]) => `${field}: ${message}`),
  ].join('\n');
}

function toPayload(values: FormValues): CreateListingPayload {
  const details = {
    ...(values.brand.trim() ? { brand: values.brand.trim() } : {}),
    ...(values.model.trim() ? { model: values.model.trim() } : {}),
    ...(values.size.trim() ? { size: values.size.trim() } : {}),
  };

  return {
    sport: values.sport.trim(),
    title: values.title,
    description: values.description,
    category: values.category.trim(),
    condition: values.condition.trim(),
    price: values.price.trim() ? Number(values.price) : Number.NaN,
    currency: values.currency.trim().toUpperCase(),
    ...(values.location.trim() ? { location: values.location } : {}),
    details,
  } as CreateListingPayload;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        editable={isSupabaseConfigured}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        style={[styles.input, multiline ? styles.multilineInput : null]}
        value={value}
      />
    </View>
  );
}

function ChoiceField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.choice, value === option.value ? styles.choiceSelected : null]}
          >
            <Text
              style={[styles.choiceText, value === option.value ? styles.choiceTextSelected : null]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function CreateListingScreen() {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit() {
    setError(null);
    const rawPayload = toPayload(values);
    const parsed = createListingSchema.safeParse(rawPayload);
    if (!parsed.success) {
      setError(
        formatIssue({
          code: 'validation_error',
          message: 'Check the listing details and try again.',
          fieldErrors: Object.fromEntries(
            parsed.error.issues.map((issue) => [issue.path.join('.') || 'form', issue.message]),
          ),
        }),
      );
      return;
    }

    setSaving(true);
    const result = await listingRepository.create(parsed.data);
    setSaving(false);
    if (result.error) {
      setError(formatIssue(result.error));
      return;
    }

    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Link href="/" asChild>
            <Pressable accessibilityRole="button">
              <Text style={styles.backLink}>‹ 마켓으로 돌아가기</Text>
            </Pressable>
          </Link>
          <Text style={styles.eyebrow}>SELL ON ICEGEAR</Text>
          <Text style={styles.title}>새로운 장비를{`\n`}이웃에게 소개해보세요.</Text>
          <Text style={styles.body}>
            사용하지 않는 스키·하키 장비를 안전하게 나누고, 다음 시즌을 준비하세요.
          </Text>

          {!isSupabaseConfigured ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Supabase 연결이 필요해요</Text>
              <Text style={styles.noticeBody}>
                환경변수를 설정하면 판매글을 저장할 수 있습니다.
              </Text>
            </View>
          ) : null}

          <ChoiceField
            label="스포츠"
            onChange={(value) => update('sport', value)}
            options={[
              { value: 'ski', label: '스키' },
              { value: 'hockey', label: '아이스하키' },
            ]}
            value={values.sport}
          />
          <Field
            label="제목"
            placeholder="예: Rossignol 스키 세트 170cm"
            onChangeText={(value) => update('title', value)}
            value={values.title}
          />
          <Field
            label="상품 설명"
            placeholder="상태, 사용 기간, 구성품을 자세히 적어주세요."
            multiline
            onChangeText={(value) => update('description', value)}
            value={values.description}
          />
          <ChoiceField
            label="카테고리"
            onChange={(value) => update('category', value)}
            options={[
              { value: 'equipment', label: '장비' },
              { value: 'apparel', label: '의류' },
              { value: 'protective_gear', label: '보호장비' },
              { value: 'accessories', label: '액세서리' },
            ]}
            value={values.category}
          />
          <ChoiceField
            label="상품 상태"
            onChange={(value) => update('condition', value)}
            options={[
              { value: 'new', label: '새 상품' },
              { value: 'like_new', label: '거의 새것' },
              { value: 'good', label: '사용감 적음' },
              { value: 'fair', label: '사용감 있음' },
            ]}
            value={values.condition}
          />
          <View style={styles.inlineFields}>
            <View style={styles.inlineField}>
              <Field
                keyboardType="decimal-pad"
                label="가격"
                onChangeText={(value) => update('price', value)}
                value={values.price}
              />
            </View>
            <View style={styles.inlineField}>
              <Field
                label="통화"
                onChangeText={(value) => update('currency', value)}
                value={values.currency}
              />
            </View>
          </View>
          <Field
            label="거래 지역 (선택)"
            placeholder="예: 서울 송파구"
            onChangeText={(value) => update('location', value)}
            value={values.location}
          />
          <Field
            label="브랜드 (선택)"
            onChangeText={(value) => update('brand', value)}
            value={values.brand}
          />
          <Field
            label="모델 (선택)"
            onChangeText={(value) => update('model', value)}
            value={values.model}
          />
          <Field
            label="사이즈 (선택)"
            onChangeText={(value) => update('size', value)}
            value={values.size}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={!isSupabaseConfigured || saving}
            onPress={() => void submit()}
            style={[
              styles.submitButton,
              !isSupabaseConfigured || saving ? styles.disabledButton : null,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>판매글 저장하기</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  keyboardView: { flex: 1 },
  content: { gap: 13, paddingBottom: 34, paddingHorizontal: 20 },
  backLink: { color: colors.navy, fontSize: 13, fontWeight: '800', marginBottom: 13, marginTop: 8 },
  eyebrow: {
    color: colors.accent,
    fontFamily: fontFamilies.accentBold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.displayExtraBold,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 35,
    marginTop: 3,
  },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 8, marginTop: -2 },
  notice: {
    backgroundColor: colors.accentSoft,
    borderColor: '#FFD4C8',
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  noticeTitle: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  noticeBody: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  field: { gap: 5 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  choiceSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  choiceText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  choiceTextSelected: { color: colors.surface },
  inlineFields: { flexDirection: 'row', gap: 10 },
  inlineField: { flex: 1 },
  label: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  multilineInput: { minHeight: 115, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    minHeight: 46,
    justifyContent: 'center',
    marginTop: 9,
    paddingHorizontal: 16,
  },
  disabledButton: { opacity: 0.45 },
  submitButtonText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
});

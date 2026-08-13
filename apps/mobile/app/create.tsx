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
  Text,
  TextInput,
  View,
} from 'react-native';

import { listingRepository, type ListingRepositoryError } from '../lib/listings/repository';
import { isSupabaseConfigured } from '../lib/supabase/client';

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
  currency: 'USD',
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
              <Text style={styles.backLink}>‹ Back to market</Text>
            </Pressable>
          </Link>
          <Text style={styles.title}>Create a listing</Text>
          <Text style={styles.body}>
            Your listing starts as a draft and becomes public after review.
          </Text>

          {!isSupabaseConfigured ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Supabase is not configured</Text>
              <Text style={styles.noticeBody}>
                Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to enable
                publishing.
              </Text>
            </View>
          ) : null}

          <Field
            label="Sport (ski or hockey)"
            onChangeText={(value) => update('sport', value)}
            value={values.sport}
          />
          <Field
            label="Title"
            onChangeText={(value) => update('title', value)}
            value={values.title}
          />
          <Field
            label="Description"
            multiline
            onChangeText={(value) => update('description', value)}
            value={values.description}
          />
          <Field
            label="Category"
            onChangeText={(value) => update('category', value)}
            value={values.category}
          />
          <Field
            label="Condition"
            onChangeText={(value) => update('condition', value)}
            value={values.condition}
          />
          <View style={styles.inlineFields}>
            <View style={styles.inlineField}>
              <Field
                keyboardType="decimal-pad"
                label="Price"
                onChangeText={(value) => update('price', value)}
                value={values.price}
              />
            </View>
            <View style={styles.inlineField}>
              <Field
                label="Currency"
                onChangeText={(value) => update('currency', value)}
                value={values.currency}
              />
            </View>
          </View>
          <Field
            label="Location (optional)"
            onChangeText={(value) => update('location', value)}
            value={values.location}
          />
          <Field
            label="Brand (optional)"
            onChangeText={(value) => update('brand', value)}
            value={values.brand}
          />
          <Field
            label="Model (optional)"
            onChangeText={(value) => update('model', value)}
            value={values.model}
          />
          <Field
            label="Size (optional)"
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
              <Text style={styles.submitButtonText}>Save draft</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#f7f8fa', flex: 1 },
  keyboardView: { flex: 1 },
  content: { gap: 12, padding: 20 },
  backLink: { color: '#3d5a80', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  title: { color: '#18202b', fontSize: 28, fontWeight: '700' },
  body: { color: '#596273', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  notice: {
    backgroundColor: '#fff8e6',
    borderColor: '#eed79d',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  noticeTitle: { color: '#5f4a16', fontSize: 15, fontWeight: '700' },
  noticeBody: { color: '#5f4a16', fontSize: 13, lineHeight: 18 },
  field: { gap: 5 },
  inlineFields: { flexDirection: 'row', gap: 10 },
  inlineField: { flex: 1 },
  label: { color: '#303948', fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderColor: '#d0d5dc',
    borderRadius: 6,
    borderWidth: 1,
    color: '#18202b',
    minHeight: 42,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  multilineInput: { minHeight: 100, textAlignVertical: 'top' },
  error: { color: '#aa2e25', fontSize: 14, lineHeight: 20 },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#18202b',
    borderRadius: 6,
    minHeight: 46,
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  disabledButton: { opacity: 0.45 },
  submitButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

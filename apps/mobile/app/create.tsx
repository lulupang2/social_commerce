import {
  createListingSchema,
  type CreateListingPayload,
  type HockeyListingDetails,
  type Listing,
  type SkiListingDetails,
  type Sport,
} from '@icegear/domain';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { BasicFieldsSection } from '../components/sell/BasicFieldsSection';
import { HockeyDetailsFields } from '../components/sell/HockeyDetailsFields';
import { PhotoPickerSection } from '../components/sell/PhotoPickerSection';
import { PriceTradeSection } from '../components/sell/PriceTradeSection';
import { ReviewSection } from '../components/sell/ReviewSection';
import { SkiDetailsFields } from '../components/sell/SkiDetailsFields';
import { SuccessSection } from '../components/sell/SuccessSection';
import {
  initialHockeyDetails,
  initialSkiDetails,
  initialSellFormState,
  type SellFormState,
  type SellStep,
} from '../components/sell/types';
import { listingRepository, type ListingRepositoryError } from '../lib/listings/repository';
import { rollbackUploadedObjects, uploadListingImages } from '../lib/media/storage';
import { isSupabaseConfigured, supabase } from '../lib/supabase/client';
import { colors, radii } from '../lib/theme';
import { AppText as Text } from '../lib/typography';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function formatIssue(error: ListingRepositoryError): string {
  if (!error.fieldErrors) return error.message;
  const details = Object.entries(error.fieldErrors)
    .map(
      ([field, messages]) =>
        `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`,
    )
    .join('\n');
  return `${error.message}\n${details}`;
}

export default function CreateListingScreen() {
  const router = useRouter();
  const [form, setForm] = useState<SellFormState>(initialSellFormState);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdListing, setCreatedListing] = useState<Listing | null>(null);

  function handleSportChange(nextSport: Sport) {
    if (nextSport === form.sport) return;
    setForm((prev) => ({
      ...prev,
      sport: nextSport,
      skiDetails: initialSkiDetails,
      hockeyDetails: initialHockeyDetails,
    }));
    setStepErrors({});
  }

  function validateStep(step: SellStep): boolean {
    const errors: Record<string, string> = {};

    if (step === 1) {
      if (!form.title.trim()) {
        errors.title = '제목을 입력해 주세요.';
      }
      if (!form.description.trim()) {
        errors.description = '상품 설명을 입력해 주세요.';
      }
    }

    if (step === 2) {
      if (form.sport === 'ski') {
        const d = form.skiDetails;
        if (d.year && (isNaN(Number(d.year)) || Number(d.year) < 1900 || Number(d.year) > 2200)) {
          errors.year = '연식은 1900~2200년 사이로 입력해 주세요.';
        }
        if (
          d.lengthCm &&
          (isNaN(Number(d.lengthCm)) || Number(d.lengthCm) <= 0 || Number(d.lengthCm) > 300)
        ) {
          errors.lengthCm = '길이는 0~300cm 사이로 입력해 주세요.';
        }
        if (
          d.waistWidthMm &&
          (isNaN(Number(d.waistWidthMm)) ||
            Number(d.waistWidthMm) <= 0 ||
            Number(d.waistWidthMm) > 200)
        ) {
          errors.waistWidthMm = '허리폭은 0~200mm 사이로 입력해 주세요.';
        }
        if (
          d.radiusM &&
          (isNaN(Number(d.radiusM)) || Number(d.radiusM) <= 0 || Number(d.radiusM) > 100)
        ) {
          errors.radiusM = '회전반경은 0~100m 사이로 입력해 주세요.';
        }
        if (
          d.bootMondopointMm &&
          (isNaN(Number(d.bootMondopointMm)) ||
            Number(d.bootMondopointMm) < 100 ||
            Number(d.bootMondopointMm) > 400)
        ) {
          errors.bootMondopointMm = '몬도포인트는 100~400mm 사이로 입력해 주세요.';
        }
        if (
          d.bootFlex &&
          (isNaN(Number(d.bootFlex)) || Number(d.bootFlex) <= 0 || Number(d.bootFlex) > 200)
        ) {
          errors.bootFlex = '부츠 플렉스는 1~200 사이로 입력해 주세요.';
        }
      } else {
        const d = form.hockeyDetails;
        if (d.year && (isNaN(Number(d.year)) || Number(d.year) < 1900 || Number(d.year) > 2200)) {
          errors.year = '연식은 1900~2200년 사이로 입력해 주세요.';
        }
        if (
          d.stickFlex &&
          (isNaN(Number(d.stickFlex)) || Number(d.stickFlex) <= 0 || Number(d.stickFlex) > 200)
        ) {
          errors.stickFlex = '스틱 플렉스는 1~200 사이로 입력해 주세요.';
        }
        if (
          d.stickLengthCm &&
          (isNaN(Number(d.stickLengthCm)) ||
            Number(d.stickLengthCm) <= 0 ||
            Number(d.stickLengthCm) > 250)
        ) {
          errors.stickLengthCm = '스틱 길이는 0~250cm 사이로 입력해 주세요.';
        }
        if (
          d.skateSize &&
          (isNaN(Number(d.skateSize)) || Number(d.skateSize) <= 0 || Number(d.skateSize) > 20)
        ) {
          errors.skateSize = '스케이트 사이즈는 0~20 사이로 입력해 주세요.';
        }
      }
    }

    if (step === 3) {
      if (!form.price.trim() || isNaN(Number(form.price)) || Number(form.price) < 0) {
        errors.price = '올바른 가격을 입력해 주세요.';
      }
    }

    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleNextStep() {
    if (!validateStep(form.step)) return;
    if (form.step < 4) {
      setForm((prev) => ({ ...prev, step: (prev.step + 1) as SellStep }));
    }
  }

  function handlePrevStep() {
    if (form.step > 1 && form.step < 5) {
      setForm((prev) => ({ ...prev, step: (prev.step - 1) as SellStep }));
      setStepErrors({});
      setGlobalError(null);
    }
  }

  function buildPayload(): CreateListingPayload {
    const isSki = form.sport === 'ski';

    const skiDetails: SkiListingDetails = {
      sport: 'ski',
      ...(form.skiDetails.equipmentType ? { equipmentType: form.skiDetails.equipmentType } : {}),
      ...(form.skiDetails.discipline ? { discipline: form.skiDetails.discipline } : {}),
      ...(form.skiDetails.brand.trim() ? { brand: form.skiDetails.brand.trim() } : {}),
      ...(form.skiDetails.model.trim() ? { model: form.skiDetails.model.trim() } : {}),
      ...(form.skiDetails.year.trim() ? { year: Number(form.skiDetails.year) } : {}),
      ...(form.skiDetails.size.trim() ? { size: form.skiDetails.size.trim() } : {}),
      ...(form.skiDetails.lengthCm.trim() ? { lengthCm: Number(form.skiDetails.lengthCm) } : {}),
      ...(form.skiDetails.waistWidthMm.trim()
        ? { waistWidthMm: Number(form.skiDetails.waistWidthMm) }
        : {}),
      ...(form.skiDetails.radiusM.trim() ? { radiusM: Number(form.skiDetails.radiusM) } : {}),
      ...(form.skiDetails.bootMondopointMm.trim()
        ? { bootMondopointMm: Number(form.skiDetails.bootMondopointMm) }
        : {}),
      ...(form.skiDetails.bootFlex.trim() ? { bootFlex: Number(form.skiDetails.bootFlex) } : {}),
      ...(form.skiDetails.bindingIncluded !== null
        ? { bindingIncluded: form.skiDetails.bindingIncluded }
        : {}),
      ...(form.skiDetails.gender ? { gender: form.skiDetails.gender } : {}),
      ...(form.skiDetails.skillLevel ? { skillLevel: form.skiDetails.skillLevel } : {}),
      ...(form.skiDetails.notes.trim() ? { notes: form.skiDetails.notes.trim() } : {}),
    };

    const hockeyDetails: HockeyListingDetails = {
      sport: 'hockey',
      ...(form.hockeyDetails.equipmentType
        ? { equipmentType: form.hockeyDetails.equipmentType }
        : {}),
      ...(form.hockeyDetails.format ? { format: form.hockeyDetails.format } : {}),
      ...(form.hockeyDetails.position ? { position: form.hockeyDetails.position } : {}),
      ...(form.hockeyDetails.handedness ? { handedness: form.hockeyDetails.handedness } : {}),
      ...(form.hockeyDetails.brand.trim() ? { brand: form.hockeyDetails.brand.trim() } : {}),
      ...(form.hockeyDetails.model.trim() ? { model: form.hockeyDetails.model.trim() } : {}),
      ...(form.hockeyDetails.year.trim() ? { year: Number(form.hockeyDetails.year) } : {}),
      ...(form.hockeyDetails.size.trim() ? { size: form.hockeyDetails.size.trim() } : {}),
      ...(form.hockeyDetails.stickFlex.trim()
        ? { stickFlex: Number(form.hockeyDetails.stickFlex) }
        : {}),
      ...(form.hockeyDetails.stickLengthCm.trim()
        ? { stickLengthCm: Number(form.hockeyDetails.stickLengthCm) }
        : {}),
      ...(form.hockeyDetails.curve.trim() ? { curve: form.hockeyDetails.curve.trim() } : {}),
      ...(form.hockeyDetails.kickPoint.trim()
        ? { kickPoint: form.hockeyDetails.kickPoint.trim() }
        : {}),
      ...(form.hockeyDetails.skateSize.trim()
        ? { skateSize: Number(form.hockeyDetails.skateSize) }
        : {}),
      ...(form.hockeyDetails.skateWidth.trim()
        ? { skateWidth: form.hockeyDetails.skateWidth.trim() }
        : {}),
      ...(form.hockeyDetails.gender ? { gender: form.hockeyDetails.gender } : {}),
      ...(form.hockeyDetails.skillLevel ? { skillLevel: form.hockeyDetails.skillLevel } : {}),
      ...(form.hockeyDetails.notes.trim() ? { notes: form.hockeyDetails.notes.trim() } : {}),
    };

    return {
      sport: form.sport,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      condition: form.condition,
      price: Number(form.price),
      currency: form.currency.trim().toUpperCase(),
      ...(form.location.trim() ? { location: form.location.trim() } : {}),
      isNegotiable: form.isNegotiable,
      shippingAvailable: form.shippingAvailable,
      localPickupAvailable: form.localPickupAvailable,
      details: isSki ? skiDetails : hockeyDetails,
    } as CreateListingPayload;
  }

  async function handleSubmit() {
    setGlobalError(null);

    // Validate overall payload schema
    const payload = buildPayload();
    const parsed = createListingSchema.safeParse(payload);
    if (!parsed.success) {
      setGlobalError(
        formatIssue({
          code: 'validation_error',
          message: '입력하신 판매글 상세 정보를 확인 후 다시 시도해 주세요.',
          fieldErrors: Object.fromEntries(
            parsed.error.issues.map((issue) => [issue.path.join('.') || 'form', [issue.message]]),
          ),
        }),
      );
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setGlobalError('Supabase 연결이 설정되지 않아 판매글을 저장할 수 없습니다.');
      return;
    }

    setSubmitting(true);
    let uploadedPaths: string[] = [];

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        setGlobalError('로그인이 필요합니다. 판매글을 저장하려면 먼저 로그인해 주세요.');
        setSubmitting(false);
        return;
      }
      const sellerId = authData.user.id;

      // Handle photo upload if photos selected
      let finalPayload = { ...parsed.data };
      if (form.photos.length > 0) {
        const listingId = generateUuid();
        const uploadRes = await uploadListingImages(supabase, form.photos, sellerId, listingId);

        if (!uploadRes.success) {
          setGlobalError(`사진 업로드 실패: ${uploadRes.error.message}`);
          setSubmitting(false);
          return;
        }

        uploadedPaths = uploadRes.results.map((r) => r.storagePath);
        finalPayload = {
          ...finalPayload,
          images: uploadRes.results.map((r, i) => ({
            url: r.storagePath,
            altText: r.altText ?? undefined,
            sortOrder: r.sortOrder ?? i,
          })),
        };
      }

      // Submit listing to repository (saved as status 'draft')
      const createRes = await listingRepository.create(finalPayload);
      if (createRes.error) {
        // Rollback uploaded photos if listing creation failed
        if (uploadedPaths.length > 0) {
          await rollbackUploadedObjects(supabase, uploadedPaths);
        }
        setGlobalError(formatIssue(createRes.error));
        setSubmitting(false);
        return;
      }

      setCreatedListing(createRes.data);
      setForm((prev) => ({ ...prev, step: 5 }));
      setSubmitting(false);
    } catch (err) {
      if (uploadedPaths.length > 0 && supabase) {
        await rollbackUploadedObjects(supabase, uploadedPaths);
      }
      setGlobalError(
        err instanceof Error ? err.message : '판매글 저장 중 시스템 오류가 발생했습니다.',
      );
      setSubmitting(false);
    }
  }

  function handleReset() {
    setForm(initialSellFormState);
    setStepErrors({});
    setGlobalError(null);
    setCreatedListing(null);
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

          {!isSupabaseConfigured ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Supabase 연결이 필요해요</Text>
              <Text style={styles.noticeBody}>
                환경변수를 설정하면 판매글을 저장할 수 있습니다.
              </Text>
            </View>
          ) : null}

          {/* 단계 인디케이터 (Step 1-4) */}
          {form.step < 5 ? (
            <View style={styles.stepHeader}>
              <View style={styles.stepTrack}>
                {[1, 2, 3, 4].map((s) => (
                  <Pressable
                    key={s}
                    accessibilityRole="button"
                    accessibilityLabel={`${s}단계로 이동`}
                    disabled={submitting || s > form.step}
                    onPress={() => {
                      if (s < form.step) {
                        setForm((prev) => ({ ...prev, step: s as SellStep }));
                        setStepErrors({});
                      }
                    }}
                    style={[
                      styles.stepDot,
                      form.step === s ? styles.stepDotActive : null,
                      form.step > s ? styles.stepDotCompleted : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.stepDotText,
                        form.step === s || form.step > s ? styles.stepDotTextActive : null,
                      ]}
                    >
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.stepLabel}>
                {form.step === 1 && 'Step 1: 사진 & 기본 정보'}
                {form.step === 2 && `Step 2: ${form.sport === 'ski' ? '스키' : '하키'} 세부 사양`}
                {form.step === 3 && 'Step 3: 가격 & 거래 방법'}
                {form.step === 4 && 'Step 4: 최종 검토 & 제출'}
              </Text>
            </View>
          ) : null}

          {/* Step 1: 사진 및 기본 정보 */}
          {form.step === 1 ? (
            <>
              <PhotoPickerSection
                onChangePhotos={(photos) => setForm((prev) => ({ ...prev, photos }))}
                photos={form.photos}
              />
              <BasicFieldsSection
                category={form.category}
                condition={form.condition}
                description={form.description}
                errors={stepErrors}
                onCategoryChange={(category) => setForm((prev) => ({ ...prev, category }))}
                onConditionChange={(condition) => setForm((prev) => ({ ...prev, condition }))}
                onDescriptionChange={(description) => setForm((prev) => ({ ...prev, description }))}
                onSportChange={handleSportChange}
                onTitleChange={(title) => setForm((prev) => ({ ...prev, title }))}
                sport={form.sport}
                title={form.title}
              />
            </>
          ) : null}

          {/* Step 2: 스포츠 세부 사양 */}
          {form.step === 2 ? (
            form.sport === 'ski' ? (
              <SkiDetailsFields
                errors={stepErrors}
                onChange={(skiDetails) => setForm((prev) => ({ ...prev, skiDetails }))}
                value={form.skiDetails}
              />
            ) : (
              <HockeyDetailsFields
                errors={stepErrors}
                onChange={(hockeyDetails) => setForm((prev) => ({ ...prev, hockeyDetails }))}
                value={form.hockeyDetails}
              />
            )
          ) : null}

          {/* Step 3: 가격 및 거래 방법 */}
          {form.step === 3 ? (
            <PriceTradeSection
              currency={form.currency}
              errors={stepErrors}
              isNegotiable={form.isNegotiable}
              localPickupAvailable={form.localPickupAvailable}
              location={form.location}
              onCurrencyChange={(currency) => setForm((prev) => ({ ...prev, currency }))}
              onIsNegotiableChange={(isNegotiable) =>
                setForm((prev) => ({ ...prev, isNegotiable }))
              }
              onLocalPickupAvailableChange={(localPickupAvailable) =>
                setForm((prev) => ({ ...prev, localPickupAvailable }))
              }
              onLocationChange={(location) => setForm((prev) => ({ ...prev, location }))}
              onPriceChange={(price) => setForm((prev) => ({ ...prev, price }))}
              onShippingAvailableChange={(shippingAvailable) =>
                setForm((prev) => ({ ...prev, shippingAvailable }))
              }
              price={form.price}
              shippingAvailable={form.shippingAvailable}
            />
          ) : null}

          {/* Step 4: 검토 & 제출 */}
          {form.step === 4 ? (
            <ReviewSection
              error={globalError}
              form={form}
              onEditStep={(s) => setForm((prev) => ({ ...prev, step: s as SellStep }))}
              onRetryUpload={() => void handleSubmit()}
              onSubmit={() => void handleSubmit()}
              submitting={submitting}
            />
          ) : null}

          {/* Step 5: 성공 화면 */}
          {form.step === 5 ? (
            <SuccessSection
              listing={createdListing}
              onGoHome={() => router.replace('/')}
              onReset={handleReset}
            />
          ) : null}

          {/* Step Controls (Next / Prev for Steps 1-3) */}
          {form.step < 4 ? (
            <View style={styles.navRow}>
              {form.step > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="이전 단계로"
                  disabled={submitting}
                  onPress={handlePrevStep}
                  style={styles.navButtonPrev}
                >
                  <Text style={styles.navButtonPrevText}>이전</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="다음 단계로"
                disabled={submitting}
                onPress={handleNextStep}
                style={[styles.navButtonNext, form.step === 1 ? styles.fullWidth : null]}
              >
                <Text style={styles.navButtonNextText}>다음 단계 (Review)</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  keyboardView: { flex: 1 },
  content: { gap: 14, paddingBottom: 40, paddingHorizontal: 20 },
  backLink: { color: colors.navy, fontSize: 13, fontWeight: '800', marginBottom: 6, marginTop: 8 },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 32,
    marginTop: 2,
  },
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
  stepHeader: { gap: 6, marginVertical: 6 },
  stepTrack: { flexDirection: 'row', gap: 8 },
  stepDot: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  stepDotActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepDotCompleted: { backgroundColor: colors.ink, borderColor: colors.ink },
  stepDotText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  stepDotTextActive: { color: '#FFF' },
  stepLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  navButtonPrev: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 20,
  },
  navButtonPrevText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  navButtonNext: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 20,
  },
  fullWidth: { flex: 1 },
  navButtonNextText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
});

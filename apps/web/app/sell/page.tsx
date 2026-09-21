'use client';

import type { CreateListing, ListingCategory, ListingCondition } from '@icegear/domain';
import { ArrowRight, CheckCircle2, LoaderCircle, Trophy, Waves } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';

import {
  MediaPicker,
  selectedMediaToFile,
  type SelectedMedia,
} from '@/components/media/MediaPicker';
import { MobileShell } from '@/components/layout/MobileShell';
import { saveLocalListing } from '@/lib/data/local-store';
import { SUMMER_LISTINGS, type MockListing } from '@/lib/data/summer-mock-data';
import { createGoListing } from '@/lib/go-listings/client';
import {
  deleteGoListingImage,
  GO_LISTING_IMAGE_MAX_COUNT,
  listGoListingImages,
  uploadGoListingImage,
} from '@/lib/go-listings/images';
import { triggerNativeHaptic } from '@/lib/native-bridge';
import { createListing as createLegacyListing } from '@/lib/supabase/mutations';

type Sport = 'surf' | 'tennis';

interface SellFormData {
  title: string;
  category: ListingCategory;
  brand: string;
  model: string;
  condition: ListingCondition;
  price: string;
  location: string;
  description: string;
  surfDiscipline: 'shortboard' | 'longboard' | 'funboard' | 'fish' | 'sup';
  boardLengthFeet: string;
  volumeLiters: string;
  finSystem: 'fcs2' | 'futures' | 'fcs' | 'single_box';
  headSizeSqIn: string;
  weightGrams: string;
  gripSize: '1' | '2' | '3';
  playStyle: 'all_court' | 'baseline_aggressive' | 'serve_volley';
}

const CATEGORY_LABELS: Record<ListingCategory, string> = {
  equipment: '보드 / 라켓 / 장비',
  apparel: '의류 / 웻슈트',
  footwear: '신발',
  protective: '보호 장비',
  accessories: '액세서리',
  other: '기타',
};

const CONDITION_LABELS: Record<ListingCondition, string> = {
  new: '새 상품',
  like_new: '거의 새것',
  good: '사용감 있음',
  fair: '사용감 많음',
  poor: '수리 필요',
};

const INITIAL_FORM: SellFormData = {
  title: '',
  category: 'equipment',
  brand: '',
  model: '',
  condition: 'like_new',
  price: '',
  location: '',
  description: '',
  surfDiscipline: 'shortboard',
  boardLengthFeet: '5.11',
  volumeLiters: '32.5',
  finSystem: 'fcs2',
  headSizeSqIn: '100',
  weightGrams: '300',
  gripSize: '2',
  playStyle: 'all_court',
};

export default function SellPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [sport, setSport] = useState<Sport>('surf');
  const [formData, setFormData] = useState<SellFormData>(INITIAL_FORM);
  const [media, setMedia] = useState<SelectedMedia[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [pendingGoListingId, setPendingGoListingId] = useState<string | null>(null);
  const [submission, setSubmission] = useState<{
    mode: 'go' | 'supabase' | 'local';
    listingId: string;
  } | null>(null);

  const update = <K extends keyof SellFormData>(key: K, value: SellFormData[K]) => {
    setFormData((current) => ({ ...current, [key]: value }));
    setFormError('');
  };

  const selectSport = (nextSport: Sport) => {
    setSport(nextSport);
    setFormData((current) => ({ ...current, category: 'equipment' }));
    triggerNativeHaptic('selection');
  };

  const validateBasicInfo = () => {
    const price = Number(formData.price);
    if (formData.title.trim().length < 4) return '제목을 4자 이상 입력해 주세요.';
    if (formData.title.trim().length > 120) return '제목은 120자까지 입력할 수 있어요.';
    if (!Number.isFinite(price) || price < 0) return '판매 가격을 정확히 입력해 주세요.';
    if (formData.location.trim().length === 0) return '희망 거래 장소를 입력해 주세요.';
    return '';
  };

  const buildPayload = (): CreateListing => {
    const common = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      category: formData.category,
      condition: formData.condition,
      price: Number(formData.price),
      currency: 'KRW',
      location: formData.location.trim(),
      localPickupAvailable: true,
    } as const;

    if (sport === 'surf') {
      return {
        ...common,
        sport: 'surf',
        details: {
          sport: 'surf',
          brand: formData.brand.trim() || undefined,
          model: formData.model.trim() || undefined,
          equipmentType: formData.category === 'apparel' ? 'wetsuit' : 'surfboard',
          discipline: formData.surfDiscipline,
          boardLengthFeet: Number(formData.boardLengthFeet),
          volumeLiters: Number(formData.volumeLiters),
          finSystem: formData.finSystem,
        },
      };
    }

    return {
      ...common,
      sport: 'tennis',
      details: {
        sport: 'tennis',
        brand: formData.brand.trim() || undefined,
        model: formData.model.trim() || undefined,
        equipmentType: formData.category === 'footwear' ? 'shoes' : 'racket',
        headSizeSqIn: Number(formData.headSizeSqIn),
        weightGrams: Number(formData.weightGrams),
        gripSize: formData.gripSize,
        playStyle: formData.playStyle,
      },
    };
  };

  const setMediaUploadState = (
    id: string,
    uploadState: SelectedMedia['uploadState'],
    uploadError = '',
    serverId?: string,
  ) => {
    setMedia((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              uploadState,
              uploadError: uploadError || undefined,
              ...(serverId ? { serverId } : {}),
            }
          : item,
      ),
    );
  };

  const verifyGoImages = async (listingId: string, items: SelectedMedia[]) => {
    const result = await listGoListingImages(listingId);
    if (!result.ok) return result.message;
    const expected = items.map((item) => item.serverId).filter(Boolean);
    const actual = result.data.map((item) => item.id);
    if (
      expected.length !== items.length ||
      actual.length !== expected.length ||
      actual.some((id, index) => id !== expected[index])
    ) {
      return '서버에 저장된 사진 순서가 화면과 일치하지 않아요. 다시 확인해 주세요.';
    }
    return '';
  };

  const uploadGoMedia = async (
    listingId: string,
    items: SelectedMedia[],
    onlyId?: string,
  ): Promise<{ items: SelectedMedia[]; error: string }> => {
    let next = items.slice();

    for (let index = 0; index < next.length; index += 1) {
      const item = next[index];
      if (onlyId && item.id !== onlyId) continue;
      if (item.serverId && item.uploadState === 'uploaded') continue;

      setMediaUploadState(item.id, 'uploading');
      let file: File;
      try {
        file = await selectedMediaToFile(item);
      } catch {
        const message = '선택한 사진을 읽지 못했어요.';
        next = next.map((entry) =>
          entry.id === item.id ? { ...entry, uploadState: 'failed', uploadError: message } : entry,
        );
        setMedia(next);
        return { items: next, error: message };
      }

      const result = await uploadGoListingImage(listingId, file, {
        sortOrder: index,
        altText: `${formData.title.trim()} 사진 ${index + 1}`,
      });
      if (!result.ok) {
        next = next.map((entry) =>
          entry.id === item.id
            ? { ...entry, uploadState: 'failed', uploadError: result.message }
            : entry,
        );
        setMedia(next);
        return { items: next, error: result.message };
      }

      next = next.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              serverId: result.data.imageId,
              uploadState: 'uploaded',
              uploadError: undefined,
            }
          : entry,
      );
      setMedia(next);
    }

    if (onlyId && next.some((item) => !item.serverId || item.uploadState !== 'uploaded')) {
      return { items: next, error: '' };
    }

    const verifyError = await verifyGoImages(listingId, next);
    return { items: next, error: verifyError };
  };

  const removeCreatedMedia = (next: SelectedMedia[]) => {
    if (!pendingGoListingId) {
      setMedia(next);
      return;
    }
    const retained = new Set(next.map((item) => item.id));
    const removed = media.filter((item) => !retained.has(item.id));
    const uploaded = removed.filter((item) => item.serverId);
    if (uploaded.length === 0) {
      setMedia(next);
      return;
    }

    setIsSubmitting(true);
    void (async () => {
      for (const item of uploaded) {
        const result = await deleteGoListingImage(pendingGoListingId, item.serverId!);
        if (!result.ok) {
          setFormError(result.message);
          setIsSubmitting(false);
          triggerNativeHaptic('error');
          return;
        }
      }
      setMedia(next);
      setFormError('');
      setIsSubmitting(false);
    })();
  };

  const retryGoMedia = async (mediaId?: string) => {
    if (!pendingGoListingId || isSubmitting) return;
    setIsSubmitting(true);
    setFormError('');
    const result = await uploadGoMedia(pendingGoListingId, media, mediaId);
    if (result.error) {
      setFormError(result.error);
      triggerNativeHaptic('error');
      setIsSubmitting(false);
      return;
    }
    if (result.items.every((item) => item.serverId && item.uploadState === 'uploaded')) {
      const verifyError = await verifyGoImages(pendingGoListingId, result.items);
      if (!verifyError) {
        setSubmission({ mode: 'go', listingId: pendingGoListingId });
        triggerNativeHaptic('success');
        setIsSubmitting(false);
        return;
      }
      setFormError(verifyError);
    }
    setIsSubmitting(false);
  };

  const saveDemoListing = () => {
    const fallback =
      SUMMER_LISTINGS.find((item) => item.sport === sport && item.category === formData.category) ??
      SUMMER_LISTINGS.find((item) => item.sport === sport) ??
      SUMMER_LISTINGS[0];
    const listingId = `local-listing-${Date.now()}`;
    const specs: Record<string, string> =
      sport === 'surf'
        ? {
            '보드 종류': formData.surfDiscipline.replaceAll('_', ' '),
            길이: `${formData.boardLengthFeet} ft`,
            부력: `${formData.volumeLiters} L`,
            '핀 시스템': formData.finSystem.toUpperCase(),
          }
        : {
            '헤드 사이즈': `${formData.headSizeSqIn} sq.in`,
            무게: `${formData.weightGrams} g`,
            그립: `G${formData.gripSize}`,
            '플레이 스타일': formData.playStyle.replaceAll('_', ' '),
          };

    const listing: MockListing = {
      id: listingId,
      sport,
      sportLabel: sport === 'surf' ? '서핑' : '테니스',
      category:
        formData.category === 'equipment' ||
        formData.category === 'apparel' ||
        formData.category === 'footwear' ||
        formData.category === 'accessories'
          ? formData.category
          : 'accessories',
      title: formData.title.trim(),
      price: Number(formData.price),
      currency: 'KRW',
      condition:
        formData.condition === 'new'
          ? 'like_new'
          : formData.condition === 'poor'
            ? 'fair'
            : formData.condition,
      conditionLabel: CONDITION_LABELS[formData.condition],
      location: formData.location.trim(),
      seller: {
        name: '나 (기기 데모)',
        avatar: fallback.seller.avatar,
        rating: 5,
        transactionCount: 0,
      },
      images: fallback.images,
      specs,
      description: formData.description.trim(),
      favoriteCount: 0,
      chatCount: 0,
      createdAt: '방금 전',
    };
    return saveLocalListing(listing) ? listingId : null;
  };

  const handleAdvance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setFormError('');

    if (step === 1) {
      setStep(2);
      triggerNativeHaptic('selection');
      return;
    }

    if (step === 2) {
      const error = validateBasicInfo();
      if (error) {
        setFormError(error);
        triggerNativeHaptic('error');
        return;
      }
      setStep(3);
      triggerNativeHaptic('selection');
      return;
    }

    if (formData.description.trim().length < 10) {
      setFormError('상태와 사용 이력을 알 수 있도록 설명을 10자 이상 입력해 주세요.');
      triggerNativeHaptic('error');
      return;
    }

    setIsSubmitting(true);
    try {
      const files = await Promise.all(media.map(selectedMediaToFile));
      const payload = buildPayload();
      const goResult = await createGoListing(payload, []);

      if (goResult?.ok) {
        const listingId = goResult.data.id;
        setPendingGoListingId(listingId);
        const upload = await uploadGoMedia(listingId, media);
        if (upload.error) {
          setFormError(upload.error);
          triggerNativeHaptic('error');
          return;
        }
        setSubmission({ mode: 'go', listingId });
        triggerNativeHaptic('success');
        return;
      }

      if (goResult && !goResult.ok) {
        setFormError(
          goResult.reason === 'unauthenticated'
            ? '실제 판매글 등록은 로그인이 필요해요. 로그인 후 다시 시도해 주세요.'
            : goResult.message,
        );
        triggerNativeHaptic('error');
        return;
      }

      if (files.length > 10) {
        setFormError('기존 백엔드 경로에서는 사진을 최대 10장까지 저장할 수 있어요.');
        triggerNativeHaptic('error');
        return;
      }

      const result = await createLegacyListing(payload, files);
      if (result.ok) {
        setSubmission({ mode: 'supabase', listingId: result.data.id });
        triggerNativeHaptic('success');
        return;
      }

      if (
        process.env.NODE_ENV !== 'production' &&
        (result.reason === 'unconfigured' || result.reason === 'unavailable')
      ) {
        const listingId = saveDemoListing();
        if (!listingId) {
          setFormError('브라우저 저장 공간이 부족해 데모 매물을 저장하지 못했어요.');
          triggerNativeHaptic('error');
          return;
        }
        setSubmission({ mode: 'local', listingId });
        triggerNativeHaptic('success');
        return;
      }

      setFormError(
        result.reason === 'unauthenticated'
          ? '실제 판매글 등록은 로그인이 필요해요. 로그인 후 다시 시도해 주세요.'
          : result.message,
      );
      triggerNativeHaptic('error');
    } catch {
      setFormError('사진을 처리하지 못했어요. 다른 사진을 선택하거나 다시 시도해 주세요.');
      triggerNativeHaptic('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submission) {
    return (
      <MobileShell title="판매 등록 완료" hideNav>
        <div className="completion-state">
          <div className="completion-icon">
            <CheckCircle2 size={44} />
          </div>
          <p className="completion-kicker">
            {submission.mode === 'go'
              ? 'Go API 검토 요청 완료'
              : submission.mode === 'supabase'
                ? '기존 검토 요청 완료'
                : '기기 데모 저장 완료'}
          </p>
          <h1>장비 등록을 마쳤어요</h1>
          <p>
            {submission.mode === 'go'
              ? 'Go 서비스 세션 소유자로 매물과 사진을 저장했어요. 운영자 검토 후 공개돼요.'
              : submission.mode === 'supabase'
                ? '운영자 검토 후 마켓에 공개돼요. MY에서 진행 상태를 확인할 수 있어요.'
                : '백엔드에 연결되면 실제 등록을 사용할 수 있어요. 지금은 이 브라우저의 마켓에서 확인할 수 있어요.'}
          </p>
          <button
            className="btn-primary"
            onClick={() => router.push(`/market/${submission.listingId}`)}
            type="button"
          >
            등록한 장비 보기
          </button>
        </div>
      </MobileShell>
    );
  }

  if (pendingGoListingId) {
    return (
      <MobileShell title="사진 업로드 마무리" showBack hideNav>
        <div className="sell-form-content">
          <section>
            <p className="form-step-description">
              매물 기본 정보는 이미 저장됐어요. 실패한 사진만 다시 올리며 새 매물을 만들지 않아요.
            </p>
            <h1 className="form-step-title">사진 업로드를 마무리해 주세요</h1>
            <div className="form-group">
              <MediaPicker
                allowReorder={!media.some((item) => item.serverId)}
                disabled={isSubmitting}
                label="장비 사진"
                maxCount={GO_LISTING_IMAGE_MAX_COUNT}
                onChange={removeCreatedMedia}
                onRetry={(id) => void retryGoMedia(id)}
                value={media}
              />
            </div>
            {formError ? (
              <p className="form-error form-submit-error" role="alert">
                {formError}
              </p>
            ) : null}
          </section>
        </div>
        <div className="sticky-bottom-action">
          <button
            className="btn-primary"
            disabled={isSubmitting}
            onClick={() => void retryGoMedia()}
            type="button"
          >
            {isSubmitting ? <LoaderCircle className="spin" size={18} /> : null}
            <span>{isSubmitting ? '확인 중' : '실패한 사진 다시 업로드'}</span>
          </button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell title="내 장비 판매하기" showBack hideNav>
      <form onSubmit={(event) => void handleAdvance(event)}>
        <div className="sell-form-content">
          <div aria-label={`판매 등록 ${step}/3단계`} className="form-progress">
            {[1, 2, 3].map((item) => (
              <span className={item <= step ? 'active' : ''} key={item} />
            ))}
          </div>

          {step === 1 ? (
            <section>
              <h1 className="form-step-title">어떤 하계 스포츠 장비인가요?</h1>
              <p className="form-step-description">
                종목에 맞는 상세 스펙만 골라서 입력할 수 있어요.
              </p>
              <div className="sport-choice-list">
                <button
                  aria-pressed={sport === 'surf'}
                  className={`sport-choice ${sport === 'surf' ? 'active' : ''}`}
                  onClick={() => selectSport('surf')}
                  type="button"
                >
                  <span className="sport-choice-icon">
                    <Waves size={24} />
                  </span>
                  <span>
                    <strong>서핑</strong>
                    <small>숏보드, 롱보드, 웻슈트, 핀, 리시</small>
                  </span>
                </button>
                <button
                  aria-pressed={sport === 'tennis'}
                  className={`sport-choice ${sport === 'tennis' ? 'active' : ''}`}
                  onClick={() => selectSport('tennis')}
                  type="button"
                >
                  <span className="sport-choice-icon">
                    <Trophy size={24} />
                  </span>
                  <span>
                    <strong>테니스</strong>
                    <small>라켓, 테니스화, 가방, 스트링, 그립</small>
                  </span>
                </button>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section>
              <h1 className="form-step-title">사진과 기본 정보를 알려주세요</h1>
              <p className="form-step-description">
                구매자가 한눈에 상태를 알 수 있는 사진과 제목이 좋아요.
              </p>

              <div className="form-group">
                <MediaPicker
                  label="장비 사진"
                  maxCount={GO_LISTING_IMAGE_MAX_COUNT}
                  onChange={setMedia}
                  value={media}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="listing-title">
                  제목
                </label>
                <input
                  className="form-input"
                  id="listing-title"
                  maxLength={120}
                  onChange={(event) => update('title', event.target.value)}
                  placeholder={
                    sport === 'surf'
                      ? "예: Channel Islands Happy Everyday 5'11 숏보드"
                      : '예: Wilson Pro Staff 97 v14 315g G2'
                  }
                  value={formData.title}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="listing-brand">
                    브랜드
                  </label>
                  <input
                    className="form-input"
                    id="listing-brand"
                    onChange={(event) => update('brand', event.target.value)}
                    placeholder={sport === 'surf' ? 'Channel Islands' : 'Wilson'}
                    value={formData.brand}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="listing-model">
                    모델명
                  </label>
                  <input
                    className="form-input"
                    id="listing-model"
                    onChange={(event) => update('model', event.target.value)}
                    placeholder="모델명"
                    value={formData.model}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="listing-category">
                    카테고리
                  </label>
                  <select
                    className="form-select"
                    id="listing-category"
                    onChange={(event) => update('category', event.target.value as ListingCategory)}
                    value={formData.category}
                  >
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="listing-condition">
                    상태
                  </label>
                  <select
                    className="form-select"
                    id="listing-condition"
                    onChange={(event) =>
                      update('condition', event.target.value as ListingCondition)
                    }
                    value={formData.condition}
                  >
                    {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="listing-price">
                    판매 가격
                  </label>
                  <div className="input-with-suffix">
                    <input
                      className="form-input"
                      id="listing-price"
                      inputMode="numeric"
                      min="0"
                      onChange={(event) => update('price', event.target.value)}
                      placeholder="250000"
                      type="number"
                      value={formData.price}
                    />
                    <span>원</span>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="listing-location">
                    거래 장소
                  </label>
                  <input
                    className="form-input"
                    id="listing-location"
                    onChange={(event) => update('location', event.target.value)}
                    placeholder={sport === 'surf' ? '양양 죽도' : '서울 송파구'}
                    value={formData.location}
                  />
                </div>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section>
              <h1 className="form-step-title">
                {sport === 'surf' ? '서핑' : '테니스'} 스펙을 확인해 주세요
              </h1>
              <p className="form-step-description">
                정확한 스펙은 맞춤 추천과 빠른 거래에 활용돼요.
              </p>

              {sport === 'surf' ? (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="surf-discipline">
                      보드 종류
                    </label>
                    <select
                      className="form-select"
                      id="surf-discipline"
                      onChange={(event) =>
                        update(
                          'surfDiscipline',
                          event.target.value as SellFormData['surfDiscipline'],
                        )
                      }
                      value={formData.surfDiscipline}
                    >
                      <option value="shortboard">숏보드</option>
                      <option value="longboard">롱보드</option>
                      <option value="funboard">펀보드 / 미드렝스</option>
                      <option value="fish">피쉬보드</option>
                      <option value="sup">SUP / 패들보드</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="board-length">
                        길이 (ft)
                      </label>
                      <input
                        className="form-input"
                        id="board-length"
                        inputMode="decimal"
                        onChange={(event) => update('boardLengthFeet', event.target.value)}
                        value={formData.boardLengthFeet}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="board-volume">
                        부력 (L)
                      </label>
                      <input
                        className="form-input"
                        id="board-volume"
                        inputMode="decimal"
                        onChange={(event) => update('volumeLiters', event.target.value)}
                        value={formData.volumeLiters}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="fin-system">
                      핀 시스템
                    </label>
                    <select
                      className="form-select"
                      id="fin-system"
                      onChange={(event) =>
                        update('finSystem', event.target.value as SellFormData['finSystem'])
                      }
                      value={formData.finSystem}
                    >
                      <option value="fcs2">FCS II</option>
                      <option value="futures">Futures</option>
                      <option value="fcs">FCS 1</option>
                      <option value="single_box">Single Fin Box</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="head-size">
                        헤드 (sq.in)
                      </label>
                      <input
                        className="form-input"
                        id="head-size"
                        inputMode="numeric"
                        onChange={(event) => update('headSizeSqIn', event.target.value)}
                        value={formData.headSizeSqIn}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="racket-weight">
                        무게 (g)
                      </label>
                      <input
                        className="form-input"
                        id="racket-weight"
                        inputMode="numeric"
                        onChange={(event) => update('weightGrams', event.target.value)}
                        value={formData.weightGrams}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="grip-size">
                        그립
                      </label>
                      <select
                        className="form-select"
                        id="grip-size"
                        onChange={(event) =>
                          update('gripSize', event.target.value as SellFormData['gripSize'])
                        }
                        value={formData.gripSize}
                      >
                        <option value="1">G1 · 4 1/8</option>
                        <option value="2">G2 · 4 1/4</option>
                        <option value="3">G3 · 4 3/8</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="play-style">
                        플레이 스타일
                      </label>
                      <select
                        className="form-select"
                        id="play-style"
                        onChange={(event) =>
                          update('playStyle', event.target.value as SellFormData['playStyle'])
                        }
                        value={formData.playStyle}
                      >
                        <option value="all_court">올라운드</option>
                        <option value="baseline_aggressive">공격형 베이스라인</option>
                        <option value="serve_volley">서브 & 발리</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="listing-description">
                  상세 설명
                </label>
                <textarea
                  className="form-textarea"
                  id="listing-description"
                  maxLength={5000}
                  onChange={(event) => update('description', event.target.value)}
                  placeholder="구입 시기, 사용 횟수, 파손이나 수리 내역, 포함 구성품을 알려주세요."
                  rows={5}
                  value={formData.description}
                />
              </div>
            </section>
          ) : null}

          {formError ? (
            <p className="form-error form-submit-error" role="alert">
              {formError}
            </p>
          ) : null}
        </div>

        <div className="sticky-bottom-action">
          {step > 1 ? (
            <button
              className="btn-outline"
              disabled={isSubmitting}
              onClick={() => setStep(step - 1)}
              type="button"
            >
              이전
            </button>
          ) : null}
          <button className="btn-primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? <LoaderCircle className="spin" size={18} /> : null}
            <span>{step === 3 ? (isSubmitting ? '등록 중' : '검토 요청하기') : '다음 단계'}</span>
            {!isSubmitting ? <ArrowRight size={18} /> : null}
          </button>
        </div>
      </form>
    </MobileShell>
  );
}

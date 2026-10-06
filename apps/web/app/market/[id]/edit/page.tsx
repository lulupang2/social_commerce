'use client';

import { useTranslate } from '@/lib/i18n/use-translate';

import type { ListingCategory, ListingCondition } from '@icegear/domain';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { use, useEffect, useMemo, useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import {
  MediaPicker,
  selectedMediaToFile,
  type SelectedMedia,
} from '@/components/media/MediaPicker';
import { getEditableGoListing, updateGoListing, type GoListing } from '@/lib/go-listings/client';
import { getGoSession } from '@/lib/go-auth/client';
import {
  deleteGoListingImage,
  GO_LISTING_IMAGE_MAX_COUNT,
  listGoListingImages,
  uploadGoListingImage,
  type GoListingImage,
} from '@/lib/go-listings/images';
import { invalidateListingFeed } from '@/lib/listings/use-listings';
import { triggerNativeHaptic } from '@/lib/native-bridge';

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

type EditableStatus = 'draft' | 'pending_review' | 'rejected';

interface EditForm {
  title: string;
  category: ListingCategory;
  condition: ListingCondition;
  price: string;
  location: string;
  description: string;
  brand: string;
  model: string;
  discipline: string;
  boardLengthFeet: string;
  volumeLiters: string;
  finSystem: string;
  headSizeSqIn: string;
  weightGrams: string;
  gripSize: string;
  playStyle: string;
}

function textDetail(details: Record<string, unknown>, key: string): string {
  const value = details[key];
  return typeof value === 'string' ? value : '';
}

function numberDetail(details: Record<string, unknown>, key: string): string {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function initialForm(listing: GoListing): EditForm {
  return {
    title: listing.title,
    category: listing.category,
    condition: listing.condition,
    price: String(listing.priceKrw),
    location: listing.location,
    description: listing.description,
    brand: textDetail(listing.details, 'brand'),
    model: textDetail(listing.details, 'model'),
    discipline: textDetail(listing.details, 'discipline') || 'shortboard',
    boardLengthFeet: numberDetail(listing.details, 'boardLengthFeet'),
    volumeLiters: numberDetail(listing.details, 'volumeLiters'),
    finSystem: textDetail(listing.details, 'finSystem') || 'fcs2',
    headSizeSqIn: numberDetail(listing.details, 'headSizeSqIn'),
    weightGrams: numberDetail(listing.details, 'weightGrams'),
    gripSize: textDetail(listing.details, 'gripSize') || '2',
    playStyle: textDetail(listing.details, 'playStyle') || 'all_court',
  };
}

function mediaFromServerImages(images: GoListingImage[]): SelectedMedia[] {
  return images.map((image, index) => ({
    id: image.id,
    serverId: image.id,
    sortOrder: image.sortOrder,
    expiresAt: image.expiresAt,
    previewUrl: image.url,
    fileName: `기존 사진 ${index + 1}`,
    mimeType: '',
    uploadState: 'uploaded' as const,
  }));
}

export default function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const translate = useTranslate();
  const { id } = use(params);
  const router = useRouter();
  const [listing, setListing] = useState<GoListing | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [media, setMedia] = useState<SelectedMedia[]>([]);
  const [serverImages, setServerImages] = useState<GoListingImage[]>([]);
  const [imageLoadError, setImageLoadError] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getEditableGoListing(id), listGoListingImages(id), getGoSession()]).then(
      ([item, imageResult, session]) => {
        if (!active) return;
        setOwnerId(session.ok ? session.session.member.id : null);
        setListing(item);
        setForm(item ? initialForm(item) : null);
        if (imageResult.ok) {
          setServerImages(imageResult.data);
          setMedia(mediaFromServerImages(imageResult.data));
          setImageLoadError('');
        } else {
          setServerImages([]);
          setMedia([]);
          setImageLoadError(imageResult.message);
        }
        setIsLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [id]);

  const editable = useMemo(
    () =>
      listing !== null &&
      ownerId !== null &&
      listing.seller.id === ownerId &&
      (['draft', 'pending_review', 'rejected'] satisfies EditableStatus[]).includes(
        listing.status as EditableStatus,
      ),
    [listing, ownerId],
  );

  const update = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setError('');
    setSaved(false);
  };

  const refreshImageState = async (pending: SelectedMedia[] = media) => {
    const result = await listGoListingImages(id);
    if (!result.ok) {
      setImageLoadError(result.message);
      return { ok: false as const, message: result.message };
    }
    const pendingNew = pending.filter((item) => !item.serverId);
    setServerImages(result.data);
    const replacing = new Set(pendingNew.map((item) => item.replaceImageId).filter(Boolean));
    setMedia([
      ...mediaFromServerImages(result.data.filter((image) => !replacing.has(image.id))),
      ...pendingNew,
    ]);
    setImageLoadError('');
    return { ok: true as const, images: result.data };
  };

  const planNewImageSortOrders = (items: SelectedMedia[]) => {
    const occupied = items.flatMap((item) =>
      item.serverId || item.replaceImageId
        ? serverImages
            .filter((image) => image.id === (item.serverId ?? item.replaceImageId))
            .map((image) => image.sortOrder)
        : item.pendingImageId && item.sortOrder !== undefined
          ? [item.sortOrder]
          : [],
    );
    const used = new Set(occupied);
    const orders = new Map<string, number>();
    for (const item of items) {
      if (item.serverId) continue;
      const previous = serverImages.find((image) => image.id === item.replaceImageId);
      const order =
        previous?.sortOrder ??
        (item.pendingImageId ? item.sortOrder : undefined) ??
        Array.from({ length: GO_LISTING_IMAGE_MAX_COUNT }, (_, index) => index).find(
          (index) => !used.has(index),
        );
      if (order === undefined)
        return {
          ok: false as const,
          message: translate('사진은 최대 12장이에요. 기존 사진을 삭제하거나 교체해 주세요.'),
        };
      used.add(order);
      orders.set(item.id, order);
    }
    return { ok: true as const, sortOrderByClientId: orders };
  };

  const syncListingImages = async (items: SelectedMedia[], onlyId?: string) => {
    if (!editable)
      return { ok: false as const, message: translate('이 매물의 사진을 변경할 권한이 없어요.') };
    if (imageLoadError) {
      return { ok: false as const, message: imageLoadError };
    }
    const plan = planNewImageSortOrders(items);
    if (!plan.ok) return plan;

    const retainedIds = new Set(
      items.flatMap((item) =>
        item.serverId || item.replaceImageId ? [item.serverId ?? item.replaceImageId!] : [],
      ),
    );
    const removed = serverImages.filter((image) => !retainedIds.has(image.id));
    let next = items.slice();

    for (const image of onlyId ? [] : removed) {
      const result = await deleteGoListingImage(id, image.id);
      if (!result.ok) {
        await refreshImageState(next);
        return { ok: false as const, message: result.message };
      }
      setServerImages((current) => current.filter((entry) => entry.id !== image.id));
    }

    for (const item of next) {
      if (item.serverId || (onlyId && item.id !== onlyId)) continue;
      const sortOrder = plan.sortOrderByClientId.get(item.id);
      if (sortOrder === undefined) {
        await refreshImageState(next);
        return { ok: false as const, message: translate('사진 순서를 계산하지 못했어요.') };
      }

      next = next.map((entry) =>
        entry.id === item.id
          ? { ...entry, sortOrder, uploadState: 'uploading', uploadError: undefined }
          : entry,
      );
      setMedia(next);

      let file: File;
      try {
        file = await selectedMediaToFile(item);
      } catch {
        const message = translate('선택한 사진을 읽지 못했어요.');
        next = next.map((entry) =>
          entry.id === item.id ? { ...entry, uploadState: 'failed', uploadError: message } : entry,
        );
        setMedia(next);
        await refreshImageState(next);
        return { ok: false as const, message };
      }

      const result = await uploadGoListingImage(id, file, {
        sortOrder,
        replaceImageId: item.replaceImageId,
        pendingImageId: item.pendingImageId,
        uploadPhase: item.uploadPhase,
        altText: translate(
          `${form?.title.trim() || listing?.title || translate('매물')} 사진 ${sortOrder + 1}`,
        ),
      });
      if (!result.ok) {
        next = next.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                sortOrder,
                uploadState: 'failed',
                uploadError: result.message,
                uploadErrorCode: result.code,
                pendingImageId: result.pendingImageId,
                uploadPhase: result.uploadPhase,
              }
            : entry,
        );
        setMedia(next);
        await refreshImageState(next);
        return { ok: false as const, message: result.message };
      }

      next = next.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              serverId: result.data.imageId,
              sortOrder,
              replaceImageId: undefined,
              pendingImageId: undefined,
              uploadPhase: undefined,
              uploadState: 'uploaded',
              uploadError: undefined,
            }
          : entry,
      );
      setMedia(next);
    }

    if (next.some((item) => !item.serverId)) {
      await refreshImageState(next);
      return {
        ok: false as const,
        message: translate('아직 저장하지 못한 사진이 있어요. 해당 사진을 재시도해 주세요.'),
      };
    }
    const verified = await listGoListingImages(id);
    if (!verified.ok) {
      return { ok: false as const, message: verified.message };
    }
    const expectedIds = next.flatMap((item) => (item.serverId ? [item.serverId] : []));
    const actualIds = verified.data.map((image) => image.id);
    if (
      expectedIds.length !== actualIds.length ||
      expectedIds.some((imageId) => !actualIds.includes(imageId))
    ) {
      setServerImages(verified.data);
      setMedia(mediaFromServerImages(verified.data));
      return {
        ok: false as const,
        message: translate('서버에 저장된 사진 상태가 화면과 달라서 최신 상태로 다시 불러왔어요.'),
      };
    }

    setServerImages(verified.data);
    setMedia(mediaFromServerImages(verified.data));
    return { ok: true as const, images: verified.data };
  };

  const handleMediaChange = (next: SelectedMedia[]) => {
    if (!editable || isSaving) return;
    setMedia(next);
    setError('');
    setSaved(false);
  };

  const retryImageUpload = async (mediaId: string) => {
    if (isSaving || !editable) return;
    setIsSaving(true);
    setError('');
    const result = await syncListingImages(media, mediaId);
    if (!result.ok) {
      setError(result.message);
      triggerNativeHaptic('error');
    }
    setIsSaving(false);
  };

  const retryImageStateLoad = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError('');
    const result = await refreshImageState();
    if (!result.ok) {
      setError(result.message);
      triggerNativeHaptic('error');
    }
    setIsSaving(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!listing || !form || !editable || isSaving) return;

    const price = Number(form.price);
    if (form.title.trim().length < 1 || form.title.trim().length > 120) {
      setError(translate('제목은 1~120자로 입력해 주세요.'));
      return;
    }
    if (!Number.isSafeInteger(price) || price < 0) {
      setError(translate('가격은 0 이상의 정수로 입력해 주세요.'));
      return;
    }
    if (form.description.trim().length < 10) {
      setError(translate('상품 설명은 10자 이상 입력해 주세요.'));
      return;
    }
    if (!form.location.trim()) {
      setError(translate('거래 장소를 입력해 주세요.'));
      return;
    }

    const details: Record<string, unknown> = { ...listing.details };
    if (form.brand.trim()) details.brand = form.brand.trim();
    else delete details.brand;
    if (form.model.trim()) details.model = form.model.trim();
    else delete details.model;

    if (listing.sport === 'surf') {
      details.discipline = form.discipline;
      details.finSystem = form.finSystem;
      const length = Number(form.boardLengthFeet);
      const volume = Number(form.volumeLiters);
      if (Number.isFinite(length) && length > 0) details.boardLengthFeet = length;
      else delete details.boardLengthFeet;
      if (Number.isFinite(volume) && volume > 0) details.volumeLiters = volume;
      else delete details.volumeLiters;
    } else {
      details.gripSize = form.gripSize;
      details.playStyle = form.playStyle;
      const head = Number(form.headSizeSqIn);
      const weight = Number(form.weightGrams);
      if (Number.isFinite(head) && head > 0) details.headSizeSqIn = head;
      else delete details.headSizeSqIn;
      if (Number.isFinite(weight) && weight > 0) details.weightGrams = weight;
      else delete details.weightGrams;
    }

    if (imageLoadError) {
      setError(
        translate(
          '사진 상태를 확인하지 못해 저장을 중단했어요. 사진을 다시 불러온 뒤 시도해 주세요.',
        ),
      );
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const imageSync = await syncListingImages(media);
      if (!imageSync.ok) {
        setError(imageSync.message);
        triggerNativeHaptic('error');
        return;
      }

      const updated = await updateGoListing(id, {
        title: form.title.trim(),
        category: form.category,
        condition: form.condition,
        priceKrw: price,
        location: form.location.trim(),
        description: form.description.trim(),
        details,
      });
      if (!updated) {
        setError(translate('매물을 수정하지 못했어요. 로그인 상태나 매물 상태를 확인해 주세요.'));
        triggerNativeHaptic('error');
        return;
      }

      const [refreshed, refreshedImages] = await Promise.all([
        getEditableGoListing(id),
        listGoListingImages(id),
      ]);
      if (!refreshed || !refreshedImages.ok) {
        setError(
          !refreshedImages.ok
            ? refreshedImages.message
            : translate('저장 후 매물 상태를 다시 확인하지 못했어요.'),
        );
        triggerNativeHaptic('error');
        return;
      }

      invalidateListingFeed();
      setListing(refreshed);
      setForm(initialForm(refreshed));
      setServerImages(refreshedImages.data);
      setMedia(mediaFromServerImages(refreshedImages.data));
      setImageLoadError('');
      setSaved(true);
      triggerNativeHaptic('success');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <MobileShell title={translate('매물 수정')} showBack hideNav>
        <div className="empty-state">
          <LoaderCircle className="spin" size={28} />
          <p>{translate('매물 정보를 불러오고 있어요.')}</p>
        </div>
      </MobileShell>
    );
  }

  if (!listing || !form) {
    return (
      <MobileShell title={translate('매물 수정')} showBack hideNav>
        <div className="empty-state">
          <p>
            {translate('매물을 찾지 못했거나 접근 권한이 없어요. 소유자 계정으로 로그인해 주세요.')}
          </p>
          <a className="btn-outline" href="/auth" target="_blank" rel="noreferrer">
            {translate('다시 로그인')}
          </a>
          <button className="btn-primary" onClick={() => router.push('/market')} type="button">
            {translate('마켓으로 돌아가기')}
          </button>
        </div>
      </MobileShell>
    );
  }

  if (!editable) {
    return (
      <MobileShell title={translate('매물 수정')} showBack hideNav>
        <div className="empty-state">
          <p>
            {listing.seller.id !== ownerId
              ? translate('내 매물만 수정할 수 있어요.')
              : translate(
                  `현재 상태(${listing.status})의 매물은 사진을 수정할 수 없어요. draft/pending_review/rejected 상태에서만 변경할 수 있어요.`,
                )}
          </p>
          <button
            className="btn-primary"
            onClick={() => router.push('/market/' + listing.id)}
            type="button"
          >
            {translate('매물 보기')}
          </button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell title={translate('매물 수정')} showBack hideNav>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="sell-form-content">
          <section>
            <p className="form-step-description">
              {listing.sport === 'surf' ? translate('서핑') : translate('테니스')} ·{' '}
              {listing.status}
            </p>
            <h1 className="form-step-title">{translate('등록한 정보를 수정해 주세요')}</h1>

            <div className="form-group">
              {imageLoadError ? (
                <div className="image-load-error" role="alert">
                  <p>{imageLoadError}</p>
                  <button
                    className="btn-outline"
                    disabled={isSaving}
                    onClick={() => void retryImageStateLoad()}
                    type="button"
                  >
                    {translate('사진 다시 불러오기')}
                  </button>
                </div>
              ) : (
                <MediaPicker
                  allowReorder={false}
                  allowReplace
                  onRefresh={() => void retryImageStateLoad()}
                  disabled={isSaving}
                  label={translate('장비 사진')}
                  maxCount={GO_LISTING_IMAGE_MAX_COUNT}
                  onChange={handleMediaChange}
                  onRetry={(mediaId) => void retryImageUpload(mediaId)}
                  value={media}
                />
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-title">
                {translate('제목')}
              </label>
              <input
                className="form-input"
                id="edit-title"
                maxLength={120}
                onChange={(event) => update('title', event.target.value)}
                value={form.title}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="edit-category">
                  {translate('카테고리')}
                </label>
                <select
                  className="form-select"
                  id="edit-category"
                  onChange={(event) => update('category', event.target.value as ListingCategory)}
                  value={form.category}
                >
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {translate(label)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-condition">
                  {translate('상태')}
                </label>
                <select
                  className="form-select"
                  id="edit-condition"
                  onChange={(event) => update('condition', event.target.value as ListingCondition)}
                  value={form.condition}
                >
                  {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {translate(label)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="edit-brand">
                  {translate('브랜드')}
                </label>
                <input
                  className="form-input"
                  id="edit-brand"
                  onChange={(event) => update('brand', event.target.value)}
                  value={form.brand}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-model">
                  {translate('모델명')}
                </label>
                <input
                  className="form-input"
                  id="edit-model"
                  onChange={(event) => update('model', event.target.value)}
                  value={form.model}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="edit-price">
                  {translate('판매 가격')}
                </label>
                <input
                  className="form-input"
                  id="edit-price"
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => update('price', event.target.value)}
                  type="number"
                  value={form.price}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-location">
                  {translate('거래 장소')}
                </label>
                <input
                  className="form-input"
                  id="edit-location"
                  onChange={(event) => update('location', event.target.value)}
                  value={form.location}
                />
              </div>
            </div>

            {listing.sport === 'surf' ? (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-discipline">
                      {translate('보드 종류')}
                    </label>
                    <select
                      className="form-select"
                      id="edit-discipline"
                      onChange={(event) => update('discipline', event.target.value)}
                      value={form.discipline}
                    >
                      <option value="shortboard">{translate('숏보드')}</option>
                      <option value="longboard">{translate('롱보드')}</option>
                      <option value="funboard">{translate('펀보드 / 미드렝스')}</option>
                      <option value="fish">{translate('피쉬')}</option>
                      <option value="sup">SUP</option>
                      <option value="bodyboard">{translate('바디보드')}</option>
                      <option value="foil">{translate('포일')}</option>
                      <option value="other">{translate('기타')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-fin">
                      {translate('핀 시스템')}
                    </label>
                    <select
                      className="form-select"
                      id="edit-fin"
                      onChange={(event) => update('finSystem', event.target.value)}
                      value={form.finSystem}
                    >
                      <option value="fcs2">FCS II</option>
                      <option value="futures">Futures</option>
                      <option value="fcs">FCS</option>
                      <option value="single_box">Single Box</option>
                      <option value="other">{translate('기타')}</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-length">
                      {translate('길이 (ft)')}
                    </label>
                    <input
                      className="form-input"
                      id="edit-length"
                      inputMode="decimal"
                      onChange={(event) => update('boardLengthFeet', event.target.value)}
                      value={form.boardLengthFeet}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-volume">
                      {translate('부력 (L)')}
                    </label>
                    <input
                      className="form-input"
                      id="edit-volume"
                      inputMode="decimal"
                      onChange={(event) => update('volumeLiters', event.target.value)}
                      value={form.volumeLiters}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-head">
                      {translate('헤드 (sq.in)')}
                    </label>
                    <input
                      className="form-input"
                      id="edit-head"
                      inputMode="numeric"
                      onChange={(event) => update('headSizeSqIn', event.target.value)}
                      value={form.headSizeSqIn}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-weight">
                      {translate('무게 (g)')}
                    </label>
                    <input
                      className="form-input"
                      id="edit-weight"
                      inputMode="numeric"
                      onChange={(event) => update('weightGrams', event.target.value)}
                      value={form.weightGrams}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-grip">
                      {translate('그립')}
                    </label>
                    <select
                      className="form-select"
                      id="edit-grip"
                      onChange={(event) => update('gripSize', event.target.value)}
                      value={form.gripSize}
                    >
                      <option value="1">G1</option>
                      <option value="2">G2</option>
                      <option value="3">G3</option>
                      <option value="4">G4</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-style">
                      {translate('플레이 스타일')}
                    </label>
                    <select
                      className="form-select"
                      id="edit-style"
                      onChange={(event) => update('playStyle', event.target.value)}
                      value={form.playStyle}
                    >
                      <option value="all_court">{translate('올라운드')}</option>
                      <option value="baseline_aggressive">{translate('공격형 베이스라인')}</option>
                      <option value="serve_volley">{translate('서브 & 발리')}</option>
                      <option value="recreational">{translate('레크리에이션')}</option>
                      <option value="other">{translate('기타')}</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="edit-description">
                {translate('상세 설명')}
              </label>
              <textarea
                className="form-textarea"
                id="edit-description"
                maxLength={5000}
                onChange={(event) => update('description', event.target.value)}
                rows={6}
                value={form.description}
              />
            </div>

            {saved ? (
              <p role="status" className="form-step-description">
                <CheckCircle2 size={16} />
                {translate('수정 내용을 저장했어요.')}
              </p>
            ) : null}
            {error ? (
              <p className="form-error form-submit-error" role="alert">
                {translate(error)}
              </p>
            ) : null}
          </section>
        </div>

        <div className="sticky-bottom-action">
          <button
            className="btn-outline"
            disabled={isSaving}
            onClick={() => router.push('/market/' + listing.id)}
            type="button"
          >
            {translate('취소')}
          </button>
          <button className="btn-primary" disabled={isSaving} type="submit">
            {isSaving ? <LoaderCircle className="spin" size={18} /> : null}
            <span>{isSaving ? translate('저장 중') : translate('수정 내용 저장')}</span>
          </button>
        </div>
      </form>
    </MobileShell>
  );
}

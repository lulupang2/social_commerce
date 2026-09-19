'use client';

import type { ListingCategory, ListingCondition } from '@icegear/domain';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { use, useEffect, useMemo, useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import {
  getEditableGoListing,
  updateGoListing,
  type GoListing,
} from '@/lib/go-listings/client';
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

export default function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [listing, setListing] = useState<GoListing | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void getEditableGoListing(id).then((item) => {
      if (!active) return;
      setListing(item);
      setForm(item ? initialForm(item) : null);
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id]);

  const editable = useMemo(
    () =>
      listing !== null &&
      (['draft', 'pending_review', 'rejected'] satisfies EditableStatus[]).includes(
        listing.status as EditableStatus,
      ),
    [listing],
  );

  const update = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setError('');
    setSaved(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!listing || !form || !editable) return;

    const price = Number(form.price);
    if (form.title.trim().length < 1 || form.title.trim().length > 120) {
      setError('제목은 1~120자로 입력해 주세요.');
      return;
    }
    if (!Number.isSafeInteger(price) || price < 0) {
      setError('가격은 0 이상의 정수로 입력해 주세요.');
      return;
    }
    if (form.description.trim().length < 10) {
      setError('상품 설명은 10자 이상 입력해 주세요.');
      return;
    }
    if (!form.location.trim()) {
      setError('거래 장소를 입력해 주세요.');
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

    setIsSaving(true);
    setError('');
    const updated = await updateGoListing(id, {
      title: form.title.trim(),
      category: form.category,
      condition: form.condition,
      priceKrw: price,
      location: form.location.trim(),
      description: form.description.trim(),
      details,
    });
    setIsSaving(false);

    if (!updated) {
      setError('매물을 수정하지 못했어요. 로그인 상태나 매물 상태를 확인해 주세요.');
      triggerNativeHaptic('error');
      return;
    }

    const refreshed = await getEditableGoListing(id);
    if (refreshed) {
      setListing(refreshed);
      setForm(initialForm(refreshed));
    }
    setSaved(true);
    triggerNativeHaptic('success');
  };

  if (isLoading) {
    return (
      <MobileShell title="매물 수정" showBack hideNav>
        <div className="empty-state">
          <LoaderCircle className="spin" size={28} />
          <p>매물 정보를 불러오고 있어요.</p>
        </div>
      </MobileShell>
    );
  }

  if (!listing || !form) {
    return (
      <MobileShell title="매물 수정" showBack hideNav>
        <div className="empty-state">
          <p>수정할 수 있는 Go 매물을 찾지 못했어요.</p>
          <button className="btn-primary" onClick={() => router.push('/market')} type="button">
            마켓으로 돌아가기
          </button>
        </div>
      </MobileShell>
    );
  }

  if (!editable) {
    return (
      <MobileShell title="매물 수정" showBack hideNav>
        <div className="empty-state">
          <p>현재 상태({listing.status})의 매물은 수정할 수 없어요.</p>
          <button
            className="btn-primary"
            onClick={() => router.push('/market/' + listing.id)}
            type="button"
          >
            매물 보기
          </button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell title="매물 수정" showBack hideNav>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="sell-form-content">
          <section>
            <p className="form-step-description">
              {listing.sport === 'surf' ? '서핑' : '테니스'} · {listing.status}
            </p>
            <h1 className="form-step-title">등록한 정보를 수정해 주세요</h1>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-title">
                제목
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
                  카테고리
                </label>
                <select
                  className="form-select"
                  id="edit-category"
                  onChange={(event) =>
                    update('category', event.target.value as ListingCategory)
                  }
                  value={form.category}
                >
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-condition">
                  상태
                </label>
                <select
                  className="form-select"
                  id="edit-condition"
                  onChange={(event) =>
                    update('condition', event.target.value as ListingCondition)
                  }
                  value={form.condition}
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
                <label className="form-label" htmlFor="edit-brand">
                  브랜드
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
                  모델명
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
                  판매 가격
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
                  거래 장소
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
                      보드 종류
                    </label>
                    <select
                      className="form-select"
                      id="edit-discipline"
                      onChange={(event) => update('discipline', event.target.value)}
                      value={form.discipline}
                    >
                      <option value="shortboard">숏보드</option>
                      <option value="longboard">롱보드</option>
                      <option value="funboard">펀보드 / 미드렝스</option>
                      <option value="fish">피쉬</option>
                      <option value="sup">SUP</option>
                      <option value="bodyboard">바디보드</option>
                      <option value="foil">포일</option>
                      <option value="other">기타</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-fin">
                      핀 시스템
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
                      <option value="other">기타</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-length">
                      길이 (ft)
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
                      부력 (L)
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
                      헤드 (sq.in)
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
                      무게 (g)
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
                      그립
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
                      플레이 스타일
                    </label>
                    <select
                      className="form-select"
                      id="edit-style"
                      onChange={(event) => update('playStyle', event.target.value)}
                      value={form.playStyle}
                    >
                      <option value="all_court">올라운드</option>
                      <option value="baseline_aggressive">공격형 베이스라인</option>
                      <option value="serve_volley">서브 & 발리</option>
                      <option value="recreational">레크리에이션</option>
                      <option value="other">기타</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="edit-description">
                상세 설명
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
                <CheckCircle2 size={16} /> 수정 내용을 저장했어요.
              </p>
            ) : null}
            {error ? (
              <p className="form-error form-submit-error" role="alert">
                {error}
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
            취소
          </button>
          <button className="btn-primary" disabled={isSaving} type="submit">
            {isSaving ? <LoaderCircle className="spin" size={18} /> : null}
            <span>{isSaving ? '저장 중' : '수정 내용 저장'}</span>
          </button>
        </div>
      </form>
    </MobileShell>
  );
}

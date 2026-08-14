import type {
  Listing,
  ListingCategory,
  ListingCondition,
  ListingStatus,
  LocationInput,
  Money,
  Sport,
} from '@icegear/domain';

export const sportLabels: Record<Sport, string> = {
  ski: '스키',
  hockey: '아이스하키',
};

export const categoryLabels: Record<ListingCategory, string> = {
  equipment: '장비',
  apparel: '의류',
  protective_gear: '보호장비',
  accessories: '액세서리',
  parts: '부품',
  other: '기타',
};

export const conditionLabels: Record<ListingCondition, string> = {
  new: '새 상품',
  like_new: '거의 새것',
  good: '사용감 적음',
  fair: '사용감 있음',
  poor: '사용감 많음',
};

export const statusLabels: Record<ListingStatus, string> = {
  draft: '작성 중',
  pending_review: '검토 중',
  active: '판매 중',
  reserved: '예약 중',
  sold: '판매 완료',
  archived: '보관됨',
  removed: '삭제됨',
};

export function formatPrice(value: Listing | Money): string {
  const price = 'price' in value ? value.price : value;
  if (price.currency === 'KRW') {
    return `${price.amount.toLocaleString('ko-KR')}원`;
  }

  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: price.currency,
    maximumFractionDigits: 2,
  }).format(price.amount);
}

export function formatLocation(location: LocationInput | undefined): string {
  if (!location) return '위치 미정';
  if (typeof location === 'string') return location;
  return [location.city, location.region].filter(Boolean).join(' · ') || '위치 미정';
}

export function formatTime(value: string, now = Date.now()): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';

  const minutes = Math.max(0, Math.floor((now - date.valueOf()) / 60_000));
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(date);
}

export function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || 'I';
}

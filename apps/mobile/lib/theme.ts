import type { Listing } from '@icegear/domain';

export const colors = {
  ink: '#202124',
  muted: '#7A7D85',
  subtle: '#A5A7AD',
  canvas: '#F7F8FA',
  surface: '#FFFFFF',
  line: '#ECEDEF',
  accent: '#F06445',
  accentSoft: '#FFF0EC',
  navy: '#233A5E',
  navySoft: '#EAF0F8',
  green: '#2F8A62',
  yellow: '#F2B84B',
  danger: '#C54B4B',
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

export const sportLabels: Record<'ski' | 'hockey', string> = {
  ski: '스키',
  hockey: '아이스하키',
};

export const categoryLabels: Record<string, string> = {
  equipment: '장비',
  apparel: '의류',
  protective_gear: '보호장비',
  accessories: '액세서리',
  parts: '부품',
  other: '기타',
};

export const conditionLabels: Record<string, string> = {
  new: '새 상품',
  like_new: '거의 새것',
  good: '사용감 적음',
  fair: '사용감 있음',
  poor: '사용감 많음',
};

export function formatPrice(listing: Listing): string {
  const currency = listing.price.currency === 'KRW' ? '₩' : listing.price.currency;
  return `${currency} ${listing.price.amount.toLocaleString('ko-KR')}`;
}

export function formatLocation(location: Listing['location']): string {
  if (!location) return '위치 미정';
  if (typeof location === 'string') return location;
  return [location.city, location.region].filter(Boolean).join(' · ') || '위치 미정';
}

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const diff = Date.now() - date.valueOf();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(date);
}

export function initials(name: string): string {
  const trimmed = name.trim();
  return trimmed.slice(0, 1).toUpperCase() || 'I';
}

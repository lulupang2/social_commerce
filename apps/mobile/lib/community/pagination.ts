export const DEFAULT_COMMUNITY_PAGE_SIZE = 20;
export const MAX_COMMUNITY_PAGE_SIZE = 50;

export interface CommunityCursorValue {
  createdAt: string;
  id: string;
}

const SAFE_CURSOR_ID = /^[A-Za-z0-9-]{1,64}$/;

export function normalizeCommunityPageSize(value: number | undefined): number | null {
  if (value === undefined) return DEFAULT_COMMUNITY_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_COMMUNITY_PAGE_SIZE) return null;
  return value;
}

export function encodeCommunityCursor(value: CommunityCursorValue): string {
  return `v1|${encodeURIComponent(value.createdAt)}|${encodeURIComponent(value.id)}`;
}

export function decodeCommunityCursor(
  value: string | null | undefined,
): CommunityCursorValue | null {
  if (!value) return null;

  const parts = value.split('|');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;

  try {
    const createdAt = decodeURIComponent(parts[1] ?? '');
    const id = decodeURIComponent(parts[2] ?? '');
    if (!createdAt || Number.isNaN(Date.parse(createdAt)) || !SAFE_CURSOR_ID.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export function descendingCursorFilter(cursor: CommunityCursorValue): string {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

export function ascendingCursorFilter(cursor: CommunityCursorValue): string {
  return `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`;
}

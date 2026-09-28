/** Amounts in customer-facing Korean copy. */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

/** Explicit currency code used in order cost breakdowns. */
export function formatKrw(amount: number): string {
  return `KRW ${amount.toLocaleString('ko-KR')}`;
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('ko-KR');
}

export function formatRelativeTime(value: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.floor(hours / 24)}일 전`;
}

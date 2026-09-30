const returnQueryKeys = new Set([
  'sport',
  'category',
  'search',
  'location',
  'minPrice',
  'maxPrice',
  'sort',
  'source',
]);

export function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value))
    return '/profile';
  try {
    const url = new URL(value, 'https://summergear.invalid');
    if (url.origin !== 'https://summergear.invalid' || /%(?:2f|5c|0[0-9a-f])/i.test(url.pathname))
      return '/profile';
    if (
      !/^\/(?:$|(?:market|community|my|profile|orders|order|sell|seller|operator|chat|chats|reviews)(?:\/|$))/.test(
        url.pathname,
      )
    )
      return '/profile';
    const query = new URLSearchParams();
    for (const [key, entry] of url.searchParams)
      if (returnQueryKeys.has(key)) query.append(key, entry);
    return url.pathname + (query.size ? `?${query}` : '');
  } catch {
    return '/profile';
  }
}

export function loginUrl(returnTo: string): string {
  return `/auth?next=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

export function isProtectedPage(path: string): boolean {
  return (
    /^\/(?:my|profile|orders|order|sell|seller|operator|chat|chats)(?:\/|$)/.test(path) ||
    /^\/(?:market|community)\/(?:create$|[^/]+\/edit$)/.test(path)
  );
}

export function redirectToLogin(): void {
  if (typeof window === 'undefined' || window.location.pathname === '/auth') return;
  window.location.assign(loginUrl(window.location.pathname + window.location.search));
}

export function redirectIfUnauthorized(status: number, required = false): void {
  if (status !== 401 || typeof window === 'undefined') return;
  if (required || isProtectedPage(window.location.pathname)) redirectToLogin();
}

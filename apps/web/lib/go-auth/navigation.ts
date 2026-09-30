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

export function loginUrl(returnTo: string, cancelTo?: string): string {
  const next = safeReturnPath(returnTo);
  return `/auth?next=${encodeURIComponent(next)}&back=${encodeURIComponent(loginCancelPath(next, cancelTo ?? null))}`;
}

export function isProtectedPage(path: string): boolean {
  return (
    /^\/(?:my|profile|orders|order|sell|seller|operator|chat|chats)(?:\/|$)/.test(path) ||
    /^\/(?:market|community)\/(?:create$|[^/]+\/edit$)/.test(path)
  );
}

export function redirectToLogin(): void {
  if (typeof window === 'undefined' || window.location.pathname === '/auth') return;
  const current = window.location.pathname + window.location.search;
  // Replace the inaccessible page so browser Back cannot bounce through it.
  window.location.replace(loginUrl(current, previousPage() ?? undefined));
}

export function defaultBackPath(path: string): string {
  const pathname = safeReturnPath(path).split('?')[0];
  const product =
    pathname.match(/^\/market\/([^/]+)\/edit$/) ?? pathname.match(/^\/order\/new\/([^/]+)$/);
  if (product) return `/market/${product[1]}`;
  if (pathname.startsWith('/community/')) return '/community';
  if (pathname.startsWith('/market/') || pathname === '/sell' || pathname.startsWith('/seller/'))
    return '/market';
  if (pathname.startsWith('/order/')) return '/orders';
  if (pathname.startsWith('/chat/')) return '/chats';
  if (pathname.startsWith('/my/')) return '/profile';
  return '/';
}

function publicPage(value: string | null): string | null {
  if (!value) return null;
  const safe = safeReturnPath(value);
  return isProtectedPage(safe.split('?')[0]) ? null : safe;
}

export function loginCancelPath(next: string | null, back: string | null): string {
  return publicPage(back) ?? publicPage(next) ?? publicPage(defaultBackPath(next ?? '/')) ?? '/';
}

/** Metadata belongs to one browser entry, not a tab-wide guess at the previous page. */
export function recordPage(current: string, previous: string | null): void {
  const state = window.history.state;
  if (state?.summergearPath === current) return; // Reload or Back/Forward restores this entry.
  const from =
    previous?.split('?')[0] === current.split('?')[0]
      ? (state?.summergearPrevious ?? null)
      : previous;
  const safe = typeof from === 'string' && safeReturnPath(from) === from ? from : null;
  window.history.replaceState({ ...state, summergearPath: current, summergearPrevious: safe }, '');
}

export function previousPage(): string | null {
  if (typeof window === 'undefined') return null;
  const previous = window.history?.state?.summergearPrevious;
  return typeof previous === 'string' && safeReturnPath(previous) === previous ? previous : null;
}

export function redirectIfUnauthorized(status: number, required = false): void {
  if (status !== 401 || typeof window === 'undefined') return;
  if (required || isProtectedPage(window.location.pathname)) redirectToLogin();
}

'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';
import { recordPage } from '@/lib/go-auth/navigation';

export function NavigationHistory() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const previous = useRef<string | null>(null);
  useLayoutEffect(() => {
    const current = window.location.pathname + window.location.search;
    recordPage(current, previous.current);
    previous.current = current;
  }, [pathname, search]);
  return null;
}

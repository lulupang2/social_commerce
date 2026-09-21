'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseConfig } from './config';
import type { Database } from './database.types';

export type BrowserSupabaseClient = SupabaseClient<Database>;

let browserClient: BrowserSupabaseClient | undefined;

/** Return the singleton browser client, or null while setup is incomplete. */
export function createBrowserSupabaseClient(): BrowserSupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  browserClient ??= createBrowserClient<Database>(config.url, config.publishableKey, {
    global: {
      fetch(input, init) {
        const timeoutSignal = AbortSignal.timeout(6_000);
        const requestSignal = init?.signal;
        const signal = requestSignal
          ? AbortSignal.any([requestSignal, timeoutSignal])
          : timeoutSignal;
        return fetch(input, { ...init, signal });
      },
    },
  });
  return browserClient;
}

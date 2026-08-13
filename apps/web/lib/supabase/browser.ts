'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseConfig } from './config';
import type { Database } from './database.types';

let browserClient: SupabaseClient<Database> | undefined;

/** Return the singleton browser client, or null while setup is incomplete. */
export function createBrowserSupabaseClient(): SupabaseClient<Database> | null {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  browserClient ??= createBrowserClient<Database>(config.url, config.publishableKey);
  return browserClient;
}

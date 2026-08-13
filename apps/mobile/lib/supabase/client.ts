import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { authStorage } from './auth-storage';

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

function readPublicEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isPlaceholder(value: string): boolean {
  return /(?:your-project-ref|your-publishable-key|your-anon-key|replace[-_]|<|\$\{)/i.test(value);
}

function isSupabaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const url = readPublicEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
const publishableKey = readPublicEnv(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

/** Missing or template values intentionally keep the app in a safe offline state. */
export const supabaseConfig: SupabaseConfig | null =
  url &&
  publishableKey &&
  isSupabaseUrl(url) &&
  !isPlaceholder(url) &&
  !isPlaceholder(publishableKey)
    ? { url, publishableKey }
    : null;

export const isSupabaseConfigured = supabaseConfig !== null;

export const supabase: SupabaseClient | null = supabaseConfig
  ? createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

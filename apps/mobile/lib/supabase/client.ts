import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { authStorage, authStorageKind } from './auth-storage';

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

export type SupabaseConfigurationError =
  | 'missing_public_configuration'
  | 'placeholder_public_configuration'
  | 'invalid_url'
  | 'insecure_url'
  | 'unsafe_key';

export type SupabaseConfigurationState =
  | { status: 'configured'; config: SupabaseConfig }
  | { status: 'unconfigured'; reason: SupabaseConfigurationError };

export type DemoAuthConfigurationState =
  | { enabled: true; reason: null }
  | {
      enabled: false;
      reason: 'production_runtime' | 'flag_disabled' | 'supabase_not_configured';
    };

function readPublicEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isPlaceholder(value: string): boolean {
  return /(?:your-project-ref|your-publishable-key|your-anon-key|replace[-_]|<|\$\{)/i.test(
    value,
  );
}

function isDevelopmentRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

function decodeBase64UrlAscii(value: string): string | null {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  let output = '';

  for (let index = 0; index < padded.length; index += 4) {
    const first = alphabet.indexOf(padded[index] ?? '');
    const second = alphabet.indexOf(padded[index + 1] ?? '');
    const thirdCharacter = padded[index + 2] ?? '=';
    const fourthCharacter = padded[index + 3] ?? '=';
    const third = thirdCharacter === '=' ? 0 : alphabet.indexOf(thirdCharacter);
    const fourth = fourthCharacter === '=' ? 0 : alphabet.indexOf(fourthCharacter);

    if (first < 0 || second < 0 || third < 0 || fourth < 0) return null;

    const bits = (first << 18) | (second << 12) | (third << 6) | fourth;
    output += String.fromCharCode((bits >> 16) & 0xff);
    if (thirdCharacter !== '=') output += String.fromCharCode((bits >> 8) & 0xff);
    if (fourthCharacter !== '=') output += String.fromCharCode(bits & 0xff);
  }

  return output;
}

function readLegacyJwtRole(value: string): string | null {
  const segments = value.split('.');
  if (segments.length !== 3 || !segments[1]) return null;

  const payload = decodeBase64UrlAscii(segments[1]);
  if (!payload) return null;

  return /"role"\s*:\s*"([^"]+)"/.exec(payload)?.[1] ?? null;
}

function isUnsafeClientKey(value: string): boolean {
  if (/^(?:sb_secret_|sk[_-])/i.test(value) || /service[_-]?role/i.test(value)) {
    return true;
  }

  const jwtRole = readLegacyJwtRole(value);
  return jwtRole !== null && jwtRole !== 'anon';
}

function normalizeSupabaseUrl(value: string):
  | { url: string; error: null }
  | { url: null; error: 'invalid_url' | 'insecure_url' } {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return { url: null, error: 'invalid_url' };
    }

    const localDevelopmentHost = ['localhost', '127.0.0.1', '::1', '10.0.2.2'].includes(
      parsed.hostname,
    );
    if (parsed.protocol !== 'https:') {
      if (!(parsed.protocol === 'http:' && isDevelopmentRuntime() && localDevelopmentHost)) {
        return { url: null, error: 'insecure_url' };
      }
    }

    return { url: parsed.toString().replace(/\/$/, ''), error: null };
  } catch {
    return { url: null, error: 'invalid_url' };
  }
}

export function resolveSupabaseConfiguration(environment: {
  url?: string;
  publishableKey?: string;
}): SupabaseConfigurationState {
  const url = readPublicEnv(environment.url);
  const publishableKey = readPublicEnv(environment.publishableKey);

  if (!url || !publishableKey) {
    return { status: 'unconfigured', reason: 'missing_public_configuration' };
  }
  if (isPlaceholder(url) || isPlaceholder(publishableKey)) {
    return { status: 'unconfigured', reason: 'placeholder_public_configuration' };
  }
  if (isUnsafeClientKey(publishableKey)) {
    return { status: 'unconfigured', reason: 'unsafe_key' };
  }

  const normalizedUrl = normalizeSupabaseUrl(url);
  if (!normalizedUrl.url) {
    return {
      status: 'unconfigured',
      reason: normalizedUrl.error ?? 'invalid_url',
    };
  }

  return {
    status: 'configured',
    config: { url: normalizedUrl.url, publishableKey },
  };
}

export const supabaseConfiguration = resolveSupabaseConfiguration({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

/** Existing callers can continue to use the nullable config/client exports. */
export const supabaseConfig =
  supabaseConfiguration.status === 'configured' ? supabaseConfiguration.config : null;
export const isSupabaseConfigured = supabaseConfig !== null;

export const demoAuthConfiguration: DemoAuthConfigurationState = !isDevelopmentRuntime()
  ? { enabled: false, reason: 'production_runtime' }
  : process.env.EXPO_PUBLIC_ENABLE_DEMO_AUTH !== 'true'
    ? { enabled: false, reason: 'flag_disabled' }
    : !isSupabaseConfigured
      ? { enabled: false, reason: 'supabase_not_configured' }
      : { enabled: true, reason: null };

/** This flag controls only whether the client may request anonymous sign-in. */
export const isDemoAnonymousAuthEnabled = demoAuthConfiguration.enabled;

export const supabase: SupabaseClient | null = supabaseConfig
  ? createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: {
        storage: authStorage,
        autoRefreshToken: authStorageKind !== 'server-noop',
        persistSession: authStorageKind !== 'server-noop',
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

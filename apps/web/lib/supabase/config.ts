export const SUPABASE_URL_ENV = 'NEXT_PUBLIC_SUPABASE_URL';
export const SUPABASE_KEY_ENV = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

/**
 * Read only browser-safe Supabase settings. The service-role key must never be
 * read by this app; both supported values are public client keys.
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();

  if (!url || !publishableKey) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return null;
    }
  } catch {
    return null;
  }

  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

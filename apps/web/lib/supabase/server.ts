import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { getSupabaseConfig } from './config';
import type { Database } from './database.types';

/**
 * Create the request-scoped Supabase client used by Server Components and
 * route handlers. A missing public config is represented by null so the app
 * can render an intentional setup state instead of crashing during startup.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient<Database> | null> {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write response cookies. Route
          // handlers and middleware still receive the full cookie adapter.
        }
      },
    },
  });
}

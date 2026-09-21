import { type NextRequest, NextResponse } from 'next/server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const requestedNext = request.nextUrl.searchParams.get('next') ?? '/profile';
  const next =
    requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/profile';
  const errorUrl = new URL('/auth?error=callback_failed', request.url);

  if (!code) return NextResponse.redirect(errorUrl);

  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.redirect(new URL('/auth?error=not_configured', request.url));

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(errorUrl);
  return NextResponse.redirect(new URL(next, request.url));
}

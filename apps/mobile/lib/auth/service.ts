import * as Linking from 'expo-linking';
import type { SupabaseClient } from '@supabase/supabase-js';

import { isDemoAnonymousAuthEnabled, supabase } from '../supabase/client';
import {
  authFailure,
  authSuccess,
  toAuthenticatedAuthSession,
  type AuthBoundaryError,
  type AuthResult,
  type AuthenticatedAuthSession,
  type EmailOtpRequest,
  type EmailOtpRequestReceipt,
  type EmailOtpVerification,
  type SignOutScope,
} from './types';

// Reuse the existing Expo Router auth route; a separate callback screen is not required.
const AUTH_CALLBACK_PATH = 'auth';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^\d{6,10}$/;
const CALLBACK_VALUE_MAX_LENGTH = 8_192;
const CALLBACK_URL_MAX_LENGTH = 20_000;
const ALLOWED_EMAIL_CALLBACK_TYPES = new Set([
  'email',
  'magiclink',
  'signup',
  'invite',
  'recovery',
  'email_change',
]);

type CallbackParameters = {
  code?: string;
  flowId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenHash?: string;
  verificationType?: string;
  providerError?: boolean;
};

export interface AuthBoundary {
  requestEmailOtp(input: EmailOtpRequest): Promise<AuthResult<EmailOtpRequestReceipt>>;
  verifyEmailOtp(input: EmailOtpVerification): Promise<AuthResult<AuthenticatedAuthSession>>;
  completeAuthCallback(url: string): Promise<AuthResult<AuthenticatedAuthSession>>;
  signInAnonymouslyForDemo(): Promise<AuthResult<AuthenticatedAuthSession>>;
  signOut(scope?: SignOutScope): Promise<AuthResult<void>>;
}

function unavailableError(): AuthBoundaryError {
  return {
    code: 'not_configured',
    message: 'Authentication is not configured for this build.',
    recoverable: false,
  };
}

function requestError(): AuthBoundaryError {
  return {
    code: 'request_failed',
    message: 'Authentication could not be completed. Try again.',
    recoverable: true,
  };
}

function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized) ? normalized : null;
}

function normalizePath(value: string | null): string {
  return (value ?? '').replace(/^\/+|\/+$/g, '');
}

function sameCallbackRoute(url: string, expectedUrl: string): boolean {
  if (typeof url !== 'string' || url.length === 0 || url.length > CALLBACK_URL_MAX_LENGTH) {
    return false;
  }
  try {
    const incoming = Linking.parse(url);
    const expected = Linking.parse(expectedUrl);
    return (
      incoming.scheme?.toLowerCase() === expected.scheme?.toLowerCase() &&
      incoming.hostname?.toLowerCase() === expected.hostname?.toLowerCase() &&
      normalizePath(incoming.path) === normalizePath(expected.path)
    );
  } catch {
    return false;
  }
}

function readSingleParameter(
  query: URLSearchParams,
  fragment: URLSearchParams,
  name: string,
): string | undefined {
  const values = [...query.getAll(name), ...fragment.getAll(name)].filter(
    (value) => value.length > 0,
  );
  const distinctValues = [...new Set(values)];
  if (distinctValues.length > 1) throw new Error('Ambiguous callback parameter');

  const value = distinctValues[0];
  if (value && value.length > CALLBACK_VALUE_MAX_LENGTH) {
    throw new Error('Callback parameter is too long');
  }
  return value;
}

function parseCallbackParameters(url: string): CallbackParameters | null {
  try {
    const parsed = new URL(url);
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    const read = (name: string) => readSingleParameter(parsed.searchParams, fragment, name);
    const providerError = Boolean(read('error') || read('error_code') || read('error_description'));

    return {
      code: read('code'),
      flowId: read('sb_flow_id'),
      accessToken: read('access_token'),
      refreshToken: read('refresh_token'),
      tokenHash: read('token_hash'),
      verificationType: read('type'),
      providerError,
    };
  } catch {
    return null;
  }
}

function hasAmbiguousCredentials(parameters: CallbackParameters): boolean {
  const credentialKinds = [
    Boolean(parameters.code),
    Boolean(parameters.tokenHash),
    Boolean(parameters.accessToken || parameters.refreshToken),
  ].filter(Boolean).length;
  return credentialKinds !== 1;
}

function configuredClient(
  client: SupabaseClient | null,
): { client: SupabaseClient; error: null } | { client: null; error: AuthBoundaryError } {
  return client ? { client, error: null } : { client: null, error: unavailableError() };
}

async function sessionResult(
  client: SupabaseClient,
  session: Awaited<ReturnType<SupabaseClient['auth']['getSession']>>['data']['session'],
): Promise<AuthResult<AuthenticatedAuthSession>> {
  if (!session) return authFailure(requestError());
  if (session.user.is_anonymous === true && !isDemoAnonymousAuthEnabled) {
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch {
      // The session is still rejected even if local cleanup is unavailable.
    }
    return authFailure({
      code: 'anonymous_disabled',
      message: 'Anonymous sessions are disabled for this build.',
      recoverable: false,
    });
  }
  return authSuccess(toAuthenticatedAuthSession(session));
}

export function getAuthRedirectUrl(): string {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

export function isAuthCallbackUrl(url: string): boolean {
  return sameCallbackRoute(url, getAuthRedirectUrl());
}

export function createAuthBoundary(client: SupabaseClient | null = supabase): AuthBoundary {
  async function requestEmailOtp(
    input: EmailOtpRequest,
  ): Promise<AuthResult<EmailOtpRequestReceipt>> {
    const configured = configuredClient(client);
    if (!configured.client) return authFailure(configured.error);

    const email = normalizeEmail(typeof input?.email === 'string' ? input.email : '');
    if (!email) {
      return authFailure({
        code: 'invalid_input',
        message: 'Enter a valid email address.',
        recoverable: true,
        fieldErrors: { email: 'Enter a valid email address.' },
      });
    }
    if (input.shouldCreateUser !== undefined && typeof input.shouldCreateUser !== 'boolean') {
      return authFailure({
        code: 'invalid_input',
        message: 'The OTP request options are invalid.',
        recoverable: true,
      });
    }

    try {
      const redirectTo = getAuthRedirectUrl();
      const { error } = await configured.client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: input.shouldCreateUser ?? true,
        },
      });

      if (error) return authFailure(requestError());
      return authSuccess({ email, redirectTo });
    } catch {
      return authFailure(requestError());
    }
  }

  async function verifyEmailOtp(
    input: EmailOtpVerification,
  ): Promise<AuthResult<AuthenticatedAuthSession>> {
    const configured = configuredClient(client);
    if (!configured.client) return authFailure(configured.error);

    const email = normalizeEmail(typeof input?.email === 'string' ? input.email : '');
    const token = typeof input?.token === 'string' ? input.token.trim() : '';
    const fieldErrors: Record<string, string> = {};
    if (!email) fieldErrors.email = 'Enter a valid email address.';
    if (!OTP_PATTERN.test(token)) fieldErrors.token = 'Enter the code from your email.';
    if (Object.keys(fieldErrors).length > 0) {
      return authFailure({
        code: 'invalid_input',
        message: 'Check the email address and verification code.',
        recoverable: true,
        fieldErrors,
      });
    }

    try {
      const { data, error } = await configured.client.auth.verifyOtp({
        email: email!,
        token,
        type: 'email',
      });
      if (error) return authFailure(requestError());
      return sessionResult(configured.client, data.session);
    } catch {
      return authFailure(requestError());
    }
  }

  async function completeAuthCallback(url: string): Promise<AuthResult<AuthenticatedAuthSession>> {
    const configured = configuredClient(client);
    if (!configured.client) return authFailure(configured.error);

    if (!isAuthCallbackUrl(url)) {
      return authFailure({
        code: 'invalid_callback',
        message: 'This sign-in link is not valid for this app.',
        recoverable: true,
      });
    }

    const parameters = parseCallbackParameters(url);
    if (!parameters || parameters.providerError) {
      return authFailure({
        code: parameters?.providerError ? 'callback_failed' : 'invalid_callback',
        message: 'The sign-in link could not be verified. Request a new email.',
        recoverable: true,
      });
    }
    if (hasAmbiguousCredentials(parameters)) {
      return authFailure({
        code: 'invalid_callback',
        message: 'The sign-in link is incomplete. Request a new email.',
        recoverable: true,
      });
    }

    if (parameters.code) {
      try {
        const { data, error } = await configured.client.auth.exchangeCodeForSession(
          parameters.code,
          parameters.flowId ? { flowId: parameters.flowId } : undefined,
        );
        if (error) {
          return authFailure({
            code: 'callback_failed',
            message: 'The sign-in link could not be verified. Request a new email.',
            recoverable: true,
          });
        }
        return sessionResult(configured.client, data.session);
      } catch {
        return authFailure({
          code: 'callback_failed',
          message: 'The sign-in link could not be verified. Request a new email.',
          recoverable: true,
        });
      }
    }

    if (parameters.tokenHash) {
      const verificationType = parameters.verificationType ?? 'email';
      if (!ALLOWED_EMAIL_CALLBACK_TYPES.has(verificationType)) {
        return authFailure({
          code: 'invalid_callback',
          message: 'This sign-in link type is not supported.',
          recoverable: true,
        });
      }

      try {
        const { data, error } = await configured.client.auth.verifyOtp({
          token_hash: parameters.tokenHash,
          type: verificationType,
        });
        if (error) {
          return authFailure({
            code: 'callback_failed',
            message: 'The sign-in link could not be verified. Request a new email.',
            recoverable: true,
          });
        }
        return sessionResult(configured.client, data.session);
      } catch {
        return authFailure({
          code: 'callback_failed',
          message: 'The sign-in link could not be verified. Request a new email.',
          recoverable: true,
        });
      }
    }

    if (!parameters.accessToken || !parameters.refreshToken) {
      return authFailure({
        code: 'invalid_callback',
        message: 'The sign-in link is incomplete. Request a new email.',
        recoverable: true,
      });
    }

    try {
      const { data, error } = await configured.client.auth.setSession({
        access_token: parameters.accessToken,
        refresh_token: parameters.refreshToken,
      });
      if (error) {
        return authFailure({
          code: 'callback_failed',
          message: 'The sign-in link could not be verified. Request a new email.',
          recoverable: true,
        });
      }
      return sessionResult(configured.client, data.session);
    } catch {
      return authFailure({
        code: 'callback_failed',
        message: 'The sign-in link could not be verified. Request a new email.',
        recoverable: true,
      });
    }
  }

  async function signInAnonymouslyForDemo(): Promise<AuthResult<AuthenticatedAuthSession>> {
    if (!isDemoAnonymousAuthEnabled) {
      return authFailure({
        code: 'anonymous_disabled',
        message: 'Demo sign-in is disabled for this build.',
        recoverable: false,
      });
    }

    const configured = configuredClient(client);
    if (!configured.client) return authFailure(configured.error);

    try {
      const { data, error } = await configured.client.auth.signInAnonymously();
      if (error || !data.session || data.user?.is_anonymous !== true) {
        return authFailure(requestError());
      }
      return authSuccess(toAuthenticatedAuthSession(data.session));
    } catch {
      return authFailure(requestError());
    }
  }

  async function signOut(scope: SignOutScope = 'local'): Promise<AuthResult<void>> {
    const configured = configuredClient(client);
    if (!configured.client) return authFailure(configured.error);
    if (scope !== 'local' && scope !== 'global') {
      return authFailure({
        code: 'invalid_input',
        message: 'The sign-out scope is invalid.',
        recoverable: true,
      });
    }

    try {
      const { error } = await configured.client.auth.signOut({ scope });
      return error ? authFailure(requestError()) : authSuccess(undefined);
    } catch {
      return authFailure(requestError());
    }
  }

  return {
    requestEmailOtp,
    verifyEmailOtp,
    completeAuthCallback,
    signInAnonymouslyForDemo,
    signOut,
  };
}

export const authBoundary = createAuthBoundary();
export const requestEmailOtp = authBoundary.requestEmailOtp;
export const verifyEmailOtp = authBoundary.verifyEmailOtp;
export const completeAuthCallback = authBoundary.completeAuthCallback;
export const signInAnonymouslyForDemo = authBoundary.signInAnonymouslyForDemo;
export const signOut = authBoundary.signOut;

import type { Session, User } from '@supabase/supabase-js';

export type AuthBoundaryErrorCode =
  | 'not_configured'
  | 'invalid_input'
  | 'anonymous_disabled'
  | 'invalid_callback'
  | 'callback_failed'
  | 'request_failed';

export interface AuthBoundaryError {
  code: AuthBoundaryErrorCode;
  message: string;
  recoverable: boolean;
  fieldErrors?: Record<string, string>;
}

export type AuthResult<T> = { data: T; error: null } | { data: null; error: AuthBoundaryError };

export interface AuthenticatedAuthSession {
  session: Session;
  user: User;
  isAnonymous: boolean;
}

export interface EmailOtpRequest {
  email: string;
  shouldCreateUser?: boolean;
}

export interface EmailOtpRequestReceipt {
  email: string;
  redirectTo: string;
}

export interface EmailOtpVerification {
  email: string;
  token: string;
}

export type SignOutScope = 'local' | 'global';

export type SessionState =
  | { status: 'loading' }
  | {
      status: 'unauthenticated';
      reason: 'initial' | 'signed_out' | 'session_missing' | 'anonymous_rejected';
    }
  | ({ status: 'authenticated' } & AuthenticatedAuthSession)
  | { status: 'callback' }
  | { status: 'error'; error: AuthBoundaryError };

export function authSuccess<T>(data: T): AuthResult<T> {
  return { data, error: null };
}

export function authFailure<T>(error: AuthBoundaryError): AuthResult<T> {
  return { data: null, error };
}

export function toAuthenticatedAuthSession(session: Session): AuthenticatedAuthSession {
  return {
    session,
    user: session.user,
    isAnonymous: session.user.is_anonymous === true,
  };
}

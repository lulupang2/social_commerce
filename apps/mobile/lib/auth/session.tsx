import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as Linking from 'expo-linking';
import { AppState, Platform } from 'react-native';

import { isDemoAnonymousAuthEnabled, supabase } from '../supabase/client';
import { completeAuthCallback, isAuthCallbackUrl } from './service';
import {
  toAuthenticatedAuthSession,
  type AuthResult,
  type AuthenticatedAuthSession,
  type SessionState,
} from './types';

export interface SessionContextValue {
  state: SessionState;
  refresh(): Promise<void>;
  processCallback(url: string): Promise<AuthResult<AuthenticatedAuthSession>>;
  clearError(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function isRejectedAnonymousSession(
  session: Awaited<
    ReturnType<NonNullable<typeof supabase>['auth']['getSession']>
  >['data']['session'],
): boolean {
  return session?.user.is_anonymous === true && !isDemoAnonymousAuthEnabled;
}

function discardRejectedSession(client: NonNullable<typeof supabase>): void {
  setTimeout(() => {
    void client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }, 0);
}

function fingerprint(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const initialized = useRef(false);
  const processedCallbacks = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!supabase) {
      setState({
        status: 'error',
        error: {
          code: 'not_configured',
          message: 'Authentication is not configured for this build.',
          recoverable: false,
        },
      });
      return;
    }

    setState({ status: 'loading' });
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setState({
          status: 'error',
          error: {
            code: 'request_failed',
            message: 'The saved session could not be restored. Sign in again.',
            recoverable: true,
          },
        });
      } else if (isRejectedAnonymousSession(data.session)) {
        discardRejectedSession(supabase);
        setState({ status: 'unauthenticated', reason: 'anonymous_rejected' });
      } else if (data.session) {
        setState({ status: 'authenticated', ...toAuthenticatedAuthSession(data.session) });
      } else {
        setState({ status: 'unauthenticated', reason: 'session_missing' });
      }
    } catch {
      setState({
        status: 'error',
        error: {
          code: 'request_failed',
          message: 'The saved session could not be restored. Sign in again.',
          recoverable: true,
        },
      });
    }
  }, []);

  const processCallback = useCallback(
    async (url: string): Promise<AuthResult<AuthenticatedAuthSession>> => {
      const callbackFingerprint = fingerprint(url);
      if (processedCallbacks.current.has(callbackFingerprint)) {
        try {
          const session = supabase ? await supabase.auth.getSession() : null;
          if (session?.data.session && !isRejectedAnonymousSession(session.data.session)) {
            const authenticated = toAuthenticatedAuthSession(session.data.session);
            setState({ status: 'authenticated', ...authenticated });
            return { data: authenticated, error: null };
          }
        } catch {
          // Re-running the callback below returns a sanitized boundary error.
        }
      }

      processedCallbacks.current.add(callbackFingerprint);
      setState({ status: 'callback' });
      const result = await completeAuthCallback(url);
      if (result.error) {
        setState({ status: 'error', error: result.error });
      } else {
        setState({ status: 'authenticated', ...result.data });
      }
      return result;
    },
    [],
  );

  useEffect(() => {
    let mounted = true;
    const client = supabase;
    if (!client) {
      setState({
        status: 'error',
        error: {
          code: 'not_configured',
          message: 'Authentication is not configured for this build.',
          recoverable: false,
        },
      });
      return undefined;
    }

    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      if (!mounted || (event === 'INITIAL_SESSION' && !initialized.current)) return;

      if (isRejectedAnonymousSession(session)) {
        discardRejectedSession(client);
        setState({ status: 'unauthenticated', reason: 'anonymous_rejected' });
      } else if (session) {
        setState({ status: 'authenticated', ...toAuthenticatedAuthSession(session) });
      } else {
        setState({
          status: 'unauthenticated',
          reason: event === 'SIGNED_OUT' ? 'signed_out' : 'session_missing',
        });
      }
    });

    const linkListener = Linking.addEventListener('url', ({ url }) => {
      if (isAuthCallbackUrl(url)) void processCallback(url);
    });

    void (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (!mounted) return;

        if (initialUrl && isAuthCallbackUrl(initialUrl)) {
          await processCallback(initialUrl);
        } else {
          const { data, error } = await client.auth.getSession();
          if (!mounted) return;

          if (error) {
            setState({
              status: 'error',
              error: {
                code: 'request_failed',
                message: 'The saved session could not be restored. Sign in again.',
                recoverable: true,
              },
            });
          } else if (isRejectedAnonymousSession(data.session)) {
            discardRejectedSession(client);
            setState({ status: 'unauthenticated', reason: 'anonymous_rejected' });
          } else if (data.session) {
            setState({ status: 'authenticated', ...toAuthenticatedAuthSession(data.session) });
          } else {
            setState({ status: 'unauthenticated', reason: 'initial' });
          }
        }
      } catch {
        if (mounted) {
          setState({
            status: 'error',
            error: {
              code: 'request_failed',
              message: 'The saved session could not be restored. Sign in again.',
              recoverable: true,
            },
          });
        }
      } finally {
        initialized.current = true;
      }
    })();

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      linkListener.remove();
    };
  }, [processCallback]);

  useEffect(() => {
    const client = supabase;
    if (!client || Platform.OS === 'web') return undefined;

    if (AppState.currentState === 'active') {
      void client.auth.startAutoRefresh().catch(() => undefined);
    }
    const appStateListener = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void client.auth.startAutoRefresh().catch(() => undefined);
      } else {
        void client.auth.stopAutoRefresh().catch(() => undefined);
      }
    });

    return () => {
      appStateListener.remove();
      void client.auth.stopAutoRefresh().catch(() => undefined);
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ state, refresh, processCallback, clearError: refresh }),
    [processCallback, refresh, state],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider.');
  return context;
}

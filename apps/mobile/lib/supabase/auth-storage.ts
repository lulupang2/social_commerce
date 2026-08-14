import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/** The storage surface consumed by Supabase Auth. */
export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type AuthStorageKind =
  | 'native-async-storage'
  | 'web-local-storage'
  | 'server-noop';

const serverStorage: AuthStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};

const webStorage: AuthStorage = {
  async getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      throw new Error('Auth session storage is unavailable.');
    }
  },
  async setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      throw new Error('Auth session storage is unavailable.');
    }
  },
  async removeItem(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      throw new Error('Auth session storage is unavailable.');
    }
  },
};

/**
 * Keeps the adapter injectable without logging or transforming bearer-session
 * values. Native persistence stays inside the app sandbox; browser persistence
 * uses the current origin only; server rendering never shares a session store.
 */
export function createAuthStorage(storage: AuthStorage = resolveStorage().storage): AuthStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
}

function resolveStorage(): { storage: AuthStorage; kind: AuthStorageKind } {
  if (Platform.OS === 'web') {
    return typeof window === 'undefined'
      ? { storage: serverStorage, kind: 'server-noop' }
      : { storage: webStorage, kind: 'web-local-storage' };
  }

  return { storage: AsyncStorage, kind: 'native-async-storage' };
}

const resolvedStorage = resolveStorage();

export const authStorageKind = resolvedStorage.kind;
export const authStorage = createAuthStorage(resolvedStorage.storage);

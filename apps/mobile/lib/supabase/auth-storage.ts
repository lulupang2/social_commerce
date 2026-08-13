import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The small storage surface Supabase Auth needs. Keeping this behind an
 * interface makes the client easy to replace with SecureStore or a test
 * double without coupling the rest of the app to a storage package.
 */
export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createAuthStorage(storage: AuthStorage = AsyncStorage): AuthStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
}

export const authStorage = createAuthStorage();

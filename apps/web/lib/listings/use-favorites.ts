'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uuidSchema } from '@icegear/domain';

import { getFavoriteIds, LOCAL_STORE_EVENT, setListingFavorite } from '../data/local-store';
import { triggerNativeHaptic } from '../native-bridge';
import { createBrowserSupabaseClient } from '../supabase/browser';

export function useFavorites() {
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const ids = getFavoriteIds();
      setFavorites(Object.fromEntries(ids.map((id) => [id, true])));
    };

    const client = createBrowserSupabaseClient();
    if (client) {
      void client.auth.getUser().then(async ({ data }) => {
        if (!data.user) return;
        userIdRef.current = data.user.id;
        const { data: rows } = await client
          .from('favorites')
          .select('listing_id')
          .eq('user_id', data.user.id);
        if (!rows) return;
        setFavorites((current) => ({
          ...current,
          ...Object.fromEntries(rows.map((row) => [row.listing_id, true])),
        }));
      });
    }
    refresh();
    window.addEventListener(LOCAL_STORE_EVENT, refresh);
    return () => window.removeEventListener(LOCAL_STORE_EVENT, refresh);
  }, []);
  const updateFavorite = useCallback((id: string, favorite: boolean) => {
    setListingFavorite(id, favorite);
    setFavorites((current) => ({ ...current, [id]: favorite }));
    triggerNativeHaptic('selection');

    const client = createBrowserSupabaseClient();
    const userId = userIdRef.current;
    if (!client || !userId || !uuidSchema.safeParse(id).success) return;
    if (favorite) {
      void client.from('favorites').upsert({ user_id: userId, listing_id: id });
    } else {
      void client.from('favorites').delete().eq('user_id', userId).eq('listing_id', id);
    }
  }, []);

  return { favorites, updateFavorite };
}

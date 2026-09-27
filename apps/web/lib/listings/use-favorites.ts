'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uuidSchema } from '@icegear/domain';

import { getFavoriteIds, LOCAL_STORE_EVENT, setListingFavorite } from '../data/local-store';
import { AUTH_SESSION_EVENT, getGoSession } from '../go-auth/client';
import { listPersonalListings, setGoFavorite } from '../go-listings/personal';
import { triggerNativeHaptic } from '../native-bridge';
import { createBrowserSupabaseClient } from '../supabase/browser';

export function useFavorites() {
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const memberIdRef = useRef<string | null>(null);
  const legacyIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let revision = 0;
    const localFavorites = () => Object.fromEntries(
      getFavoriteIds().filter((id) => !id.startsWith('go:') && !uuidSchema.safeParse(id).success).map((id) => [id, true]),
    );
    const load = async () => {
      const current = ++revision;
      memberIdRef.current = null;
      legacyIdRef.current = null;
      setFavorites({});
      setError('');
      const session = await getGoSession();
      if (!active || current !== revision) return;
      if (session.ok) {
        const id = session.session.member.id;
        const result = await listPersonalListings('favorites');
        if (!active || current !== revision) return;
        if (!result.ok) { setError(result.message); return; }
        memberIdRef.current = id;
        setFavorites(Object.fromEntries(result.data.map((item) => [`go:${item.id}`, true])));
        return;
      }
      if (session.status !== 401 && session.status !== 404) {
        setError(session.message);
        return;
      }
      const client = createBrowserSupabaseClient();
      if (client) {
        const { data } = await client.auth.getUser();
        if (!active || current !== revision) return;
        if (data.user) {
          const { data: rows, error: loadError } = await client.from('favorites').select('listing_id').eq('user_id', data.user.id);
          if (!active || current !== revision) return;
          if (loadError) { setError('찜 목록을 불러오지 못했어요.'); return; }
          legacyIdRef.current = data.user.id;
          setFavorites(Object.fromEntries((rows ?? []).map((row) => [row.listing_id, true])));
          return;
        }
      }
      setFavorites(localFavorites());
    };
    const onStoreChange = () => {
      if (memberIdRef.current || legacyIdRef.current) return;
      setFavorites(localFavorites());
    };
    void load();
    window.addEventListener(AUTH_SESSION_EVENT, load);
    window.addEventListener(LOCAL_STORE_EVENT, onStoreChange);
    window.addEventListener('focus', load);
    return () => {
      active = false;
      revision++;
      window.removeEventListener(AUTH_SESSION_EVENT, load);
      window.removeEventListener(LOCAL_STORE_EVENT, onStoreChange);
      window.removeEventListener('focus', load);
    };
  }, []);

  const updateFavorite = useCallback(async (id: string, favorite: boolean) => {
    setError('');
    if (id.startsWith('go:')) {
      const session = await getGoSession();
      if (!session.ok || session.session.member.id !== memberIdRef.current) {
        setError(session.ok ? '계정이 변경됐어요. 다시 로그인해 주세요.' : session.message);
        return false;
      }
      const result = await setGoFavorite(id.slice(3), favorite, session.session.member.id);
      if (!result.ok || result.data.listingId !== id.slice(3) || result.data.favorite !== favorite) {
        setError(result.ok ? '찜 응답을 확인하지 못했어요.' : result.message);
        return false;
      }
      if (memberIdRef.current !== session.session.member.id) return false;
    } else if (uuidSchema.safeParse(id).success && legacyIdRef.current) {
      const client = createBrowserSupabaseClient();
      if (!client) { setError('찜 서버에 연결하지 못했어요.'); return false; }
      const userId = legacyIdRef.current;
      const { error: writeError } = favorite
        ? await client.from('favorites').upsert({ user_id: userId, listing_id: id })
        : await client.from('favorites').delete().eq('user_id', userId).eq('listing_id', id);
      if (writeError || legacyIdRef.current !== userId) {
        setError('찜을 저장하지 못했어요. 다시 시도해 주세요.');
        return false;
      }
    } else {
      if (uuidSchema.safeParse(id).success || !setListingFavorite(id, favorite)) {
        setError('데모 찜을 저장하지 못했어요.');
        return false;
      }
    }
    setFavorites((current) => ({ ...current, [id]: favorite }));
    triggerNativeHaptic('selection');
    return true;
  }, []);

  return { favorites, updateFavorite, error };
}

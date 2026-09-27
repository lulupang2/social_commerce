'use client';

import type { SkillLevel } from '@icegear/domain';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { createBrowserSupabaseClient } from '../supabase/browser';
import { AUTH_SESSION_EVENT, getGoSession } from '../go-auth/client';
import { getMemberProfile, updateMemberProfile } from '../go-listings/personal';

const SURF_ID = '11111111-1111-4111-8111-111111111111';
const TENNIS_ID = '22222222-2222-4222-8222-222222222222';
const LOCAL_PROFILE_KEY = 'summergear:profile-preferences:v1';
const LOCAL_PROFILE_EVENT = 'summergear:profile-change';

export interface ProfileView {
  displayName: string;
  handle: string;
  location: string;
  surfSkill: SkillLevel;
  tennisSkill: SkillLevel;
  preferredSport: 'surf' | 'tennis' | null;
  maxBudgetKrw: number | null;
  preferredRegion: string;
  surfBoardPref: string;
  tennisRacketPref: string;
  transactionCount: number;
  savedCount: number;
}

export type ProfileSource = 'go' | 'supabase' | 'demo';

const DEMO_PROFILE: ProfileView = {
  displayName: '서퍼앤테니스러버',
  handle: '@summer_rider',
  location: '강원 양양 / 서울 송파',
  surfSkill: 'intermediate',
  tennisSkill: 'intermediate',
  surfBoardPref: '5\'11" ~ 7\'2" · 32L~47L',
  tennisRacketPref: '100 sq.in · 300g · G2',
  transactionCount: 0,
  savedCount: 0,
  preferredSport: null,
  maxBudgetKrw: null,
  preferredRegion: '',
};

function readLocalProfile(serialized: string): ProfileView {
  try {
    const stored = JSON.parse(serialized || '{}') as {
      surfSkill?: unknown;
      tennisSkill?: unknown;
    };
    const skillValues: Record<SkillLevel, true> = {
      beginner: true,
      intermediate: true,
      advanced: true,
      expert: true,
    };
    return {
      ...DEMO_PROFILE,
      surfSkill:
        typeof stored.surfSkill === 'string' && skillValues[stored.surfSkill as SkillLevel] === true
          ? (stored.surfSkill as SkillLevel)
          : DEMO_PROFILE.surfSkill,
      tennisSkill:
        typeof stored.tennisSkill === 'string' &&
        skillValues[stored.tennisSkill as SkillLevel] === true
          ? (stored.tennisSkill as SkillLevel)
          : DEMO_PROFILE.tennisSkill,
    };
  } catch {
    return DEMO_PROFILE;
  }
}

function subscribeLocalProfile(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(LOCAL_PROFILE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(LOCAL_PROFILE_EVENT, onChange);
  };
}

function getLocalProfileSnapshot() {
  return window.localStorage.getItem(LOCAL_PROFILE_KEY) ?? '';
}

function getServerProfileSnapshot() {
  return '';
}

export function useProfile() {
  const localSnapshot = useSyncExternalStore(
    subscribeLocalProfile,
    getLocalProfileSnapshot,
    getServerProfileSnapshot,
  );
  const localProfile = useMemo(() => readLocalProfile(localSnapshot), [localSnapshot]);
  const [remoteProfile, setRemoteProfile] = useState<ProfileView | null>(null);
  const [source, setSource] = useState<ProfileSource>('demo');
  const [userId, setUserId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const memberIdRef = useRef<string | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const profile = remoteProfile ?? localProfile;

  useEffect(() => {
    let active = true;
    let revision = 0;
    const load = async () => {
      const current = ++revision;
      memberIdRef.current = null;
      setRemoteProfile(null);
      setUserId(null);
      setMemberId(null);
      setError('');
      setIsLoading(true);
      const session = await getGoSession();
      if (!active || current !== revision) return;
      if (session.ok) {
        const result = await getMemberProfile();
        if (!active || current !== revision) return;
        if (result.ok && result.data.id === session.session.member.id) {
          setMemberId(result.data.id);
          memberIdRef.current = result.data.id;
          setSource('go');
          setRemoteProfile({
            ...localProfile,
            displayName: result.data.displayName || 'SummerGear 멤버',
            handle: '@' + result.data.id.slice(0, 8),
            location: result.data.preferredRegion || '선호 지역 미설정',
            surfSkill: result.data.surfSkill,
            tennisSkill: result.data.tennisSkill,
            preferredSport: result.data.preferredSport,
            maxBudgetKrw: result.data.maxBudgetKrw,
            preferredRegion: result.data.preferredRegion,
            surfBoardPref: '미설정',
            tennisRacketPref: '미설정',
            transactionCount: result.data.transactionCount,
            savedCount: result.data.savedCount,
          });
        } else {
          setError(result.ok ? '회원 정보가 현재 로그인과 일치하지 않아요.' : result.message);
        }
        setIsLoading(false);
        return;
      }
      if (session.status !== 401 && session.status !== 404) {
        setError(session.message);
        setIsLoading(false);
        return;
      }
      const client = createBrowserSupabaseClient();
      if (!client) { setSource('demo'); setIsLoading(false); return; }
      const { data } = await client.auth.getUser();
      if (!active || current !== revision) return;
      if (!data.user) { setSource('demo'); setIsLoading(false); return; }
      const [profileResult, sportsResult] = await Promise.all([
        client.from('profiles').select('display_name,handle,location').eq('id', data.user.id).maybeSingle(),
        client.from('profile_sports').select('sport_id,skill_level,size_preferences').eq('profile_id', data.user.id),
      ]);
      if (!active || current !== revision) return;
      if (profileResult.error || sportsResult.error || !profileResult.data) {
        setError('기존 프로필을 불러오지 못했어요.');
        setIsLoading(false);
        return;
      }
      const surf = sportsResult.data?.find((item) => item.sport_id === SURF_ID);
      const tennis = sportsResult.data?.find((item) => item.sport_id === TENNIS_ID);
      const location = profileResult.data.location;
      const rawLocation =
        location && typeof location === 'object' && !Array.isArray(location)
          ? [location.region, location.city, location.raw]
              .filter((value): value is string => typeof value === 'string' && value.length > 0)
              .join(' · ')
          : '';
      setUserId(data.user.id);
      setSource('supabase');
      setRemoteProfile({
        ...localProfile,
        displayName: profileResult.data.display_name || data.user.email || 'SummerGear 멤버',
        handle: profileResult.data.handle ? `@${profileResult.data.handle}` : '@new_member',
        location: rawLocation || '선호 지역 미설정',
        surfSkill: (surf?.skill_level as SkillLevel | null) ?? localProfile.surfSkill,
        tennisSkill: (tennis?.skill_level as SkillLevel | null) ?? localProfile.tennisSkill,
      });
      setIsLoading(false);
    };
    void load();
    window.addEventListener(AUTH_SESSION_EVENT, load);
    window.addEventListener('focus', load);
    return () => {
      active = false;
      revision++;
      window.removeEventListener(AUTH_SESSION_EVENT, load);
      window.removeEventListener('focus', load);
    };
  }, [localProfile]);

  const saveSkills = useCallback(
    async (surfSkill: SkillLevel, tennisSkill: SkillLevel, displayName = profile.displayName, preferences?: Pick<ProfileView, 'preferredSport' | 'maxBudgetKrw' | 'preferredRegion'>) => {
      const next = { ...profile, ...preferences, displayName, surfSkill, tennisSkill };
      if (memberId) {
        const result = await updateMemberProfile({ displayName, surfSkill, tennisSkill, preferredSport: next.preferredSport, maxBudgetKrw: next.maxBudgetKrw, preferredRegion: next.preferredRegion }, memberId);
        if (!result.ok) return { ok: false as const, message: result.message };
        if (memberIdRef.current !== memberId) return { ok: false as const, message: '계정이 변경됐어요. 다시 시도해 주세요.' };
        setRemoteProfile({
          ...next,
          preferredSport: result.data.preferredSport,
          maxBudgetKrw: result.data.maxBudgetKrw,
          preferredRegion: result.data.preferredRegion,
          location: result.data.preferredRegion || '선호 지역 미설정',
          savedCount: result.data.savedCount,
          transactionCount: result.data.transactionCount,
        });
        return { ok: true as const, source: 'go' as const };
      }
      if (!userId) {
        if (error) return { ok: false as const, message: error };
        try {
          window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify({ surfSkill, tennisSkill }));
          window.dispatchEvent(new Event(LOCAL_PROFILE_EVENT));
          return { ok: true as const, source: 'demo' as const };
        } catch {
          return { ok: false as const, message: '브라우저에 설정을 저장하지 못했어요.' };
        }
      }

      const client = createBrowserSupabaseClient();
      if (!client) return { ok: false as const, message: '프로필 서버에 연결할 수 없어요.' };
      const { error: saveError } = await client.from('profile_sports').upsert(
        [
          { profile_id: userId, sport_id: SURF_ID, skill_level: surfSkill },
          { profile_id: userId, sport_id: TENNIS_ID, skill_level: tennisSkill },
        ],
        { onConflict: 'profile_id,sport_id' },
      );
      if (saveError) return { ok: false as const, message: '맞춤 설정을 저장하지 못했어요.' };

      setRemoteProfile(next);
      await client
        .from('profiles')
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('id', userId)
        .is('onboarding_completed_at', null);
      return { ok: true as const, source: 'supabase' as const };
    },
    [profile, userId, memberId, error],
  );

  return { profile, source, saveSkills, memberId, isLoading, error };
}

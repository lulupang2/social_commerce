'use client';

import type { SkillLevel } from '@icegear/domain';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { StatePanel } from '@/components/ui/StatePanel';
import { MobileShell } from '@/components/layout/MobileShell';
import {
  Bell,
  ChevronRight,
  FileText,
  Heart,
  LoaderCircle,
  Package,
  ShoppingBag,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  Waves,
} from 'lucide-react';
import { AUTH_SESSION_EVENT, signOut } from '@/lib/go-auth/client';
import { useProfile } from '@/lib/profile/use-profile';
import { requestNativePushToken, triggerNativeHaptic } from '@/lib/native-bridge';
import { registerGoPushDevice, unregisterGoPushDevice } from '@/lib/go-auth/push';
import { getSellerStatus } from '@/lib/go-listings/seller';

const SURF_SKILL_LABELS: Record<SkillLevel, string> = {
  beginner: '입문 · 소프트보드/롱보드',
  intermediate: '중급 · 숏보드/펀보드',
  advanced: '상급 · 퍼포먼스 숏보드',
  expert: '전문 · 고성능 보드',
};

const TENNIS_SKILL_LABELS: Record<SkillLevel, string> = {
  beginner: '입문 · NTRP 1.5~2.5',
  intermediate: '중급 · NTRP 3.0~3.5',
  advanced: '상급 · NTRP 4.0~4.5',
  expert: '선수급 · NTRP 5.0+',
};

export default function ProfilePage() {
  const { profile, source, saveSkills, memberId, isLoading, error: profileError } = useProfile();
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [draftSurfSkill, setDraftSurfSkill] = useState<SkillLevel>(profile.surfSkill);
  const [draftDisplayName, setDraftDisplayName] = useState(profile.displayName);
  const [signOutError, setSignOutError] = useState('');
  const [draftTennisSkill, setDraftTennisSkill] = useState<SkillLevel>(profile.tennisSkill);
  const [draftSport, setDraftSport] = useState<'all' | 'surf' | 'tennis'>(profile.preferredSport ?? 'all');
  const [draftBudget, setDraftBudget] = useState(profile.maxBudgetKrw?.toString() ?? '');
  const [draftRegion, setDraftRegion] = useState(profile.preferredRegion);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const [notificationState, setNotificationState] = useState<
    'idle' | 'loading' | 'enabled' | 'error'
  >('idle');
  const [notificationMessage, setNotificationMessage] = useState(
    '거래 메시지와 검토 결과를 놓치지 않도록 알려드려요.',
  );
  const preferencesDialog = useRef<HTMLDialogElement>(null);
  const preferencesTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (showOnboardingModal && !isLoading && !profileError) preferencesDialog.current?.showModal();
  }, [showOnboardingModal, isLoading, profileError]);
  const closePreferences = () => {
    preferencesDialog.current?.close();
    setShowOnboardingModal(false);
    preferencesTrigger.current?.focus();
  };
  const [isReviewer, setIsReviewer] = useState(false);
  useEffect(() => {
    if (source !== 'go' || !memberId) return;
    let active = true;
    void getSellerStatus().then((result) => { if (active) setIsReviewer(result.ok && result.data.reviewer); });
    return () => { active = false; setIsReviewer(false); };
  }, [source, memberId]);

  const enableNotifications = async () => {
    if (source !== 'go') {
      setNotificationState('error');
      setNotificationMessage('Go 계정으로 로그인한 뒤 알림 기기를 등록해 주세요.');
      return;
    }
    setNotificationState('loading');
    try {
      const token = await requestNativePushToken();
      if (!token) {
        setNotificationState('error');
        setNotificationMessage('푸시 알림은 SummerGear 모바일 앱에서 켤 수 있어요.');
        return;
      }

      const result = await registerGoPushDevice(token.token, token.platform);
      if (!result.ok) {
        setNotificationState('error');
        setNotificationMessage(result.message);
        triggerNativeHaptic('error');
        return;
      }

      setNotificationState('enabled');
      setNotificationMessage('이 기기로 거래 알림을 받을 수 있어요.');
      triggerNativeHaptic('success');
    } catch {
      setNotificationState('error');
      setNotificationMessage('알림 권한을 확인하지 못했어요. 기기 설정을 확인해 주세요.');
      triggerNativeHaptic('error');
    }
  };

  const disableNotifications = async () => {
    if (source !== 'go') return;
    setNotificationState('loading');
    try {
      const token = await requestNativePushToken();
      if (!token) throw new Error('SummerGear 모바일 앱에서 알림을 해제해 주세요.');
      const result = await unregisterGoPushDevice(token.token, token.platform);
      if (!result.ok) throw new Error(result.message);
      setNotificationState('idle');
      setNotificationMessage('이 기기의 Go 거래 알림을 해제했어요.');
    } catch (cause) {
      setNotificationState('error');
      setNotificationMessage(cause instanceof Error ? cause.message : '알림 기기를 해제하지 못했어요.');
    }
  };
  const openPreferences = () => {
    setDraftSurfSkill(profile.surfSkill);
    setDraftDisplayName(profile.displayName);
    setDraftTennisSkill(profile.tennisSkill);
    setDraftSport(profile.preferredSport ?? 'all');
    setDraftBudget(profile.maxBudgetKrw?.toString() ?? '');
    setDraftRegion(profile.preferredRegion);
    setPreferenceError('');
    setShowOnboardingModal(true);
  };

  const savePreferences = async () => {
    if (source === 'go' && draftBudget && (!/^[1-9][0-9]*$/.test(draftBudget) || Number(draftBudget) > 999999999999)) { setPreferenceError('예산을 1~999,999,999,999원 사이로 입력해 주세요.'); return; }
    setIsSavingPreferences(true);
    const result = await saveSkills(draftSurfSkill, draftTennisSkill, draftDisplayName, source === 'go' ? { preferredSport: draftSport === 'all' ? null : draftSport, maxBudgetKrw: draftBudget ? Number(draftBudget) : null, preferredRegion: draftRegion.trim() } : undefined);
    setIsSavingPreferences(false);
    if (!result.ok) {
      setPreferenceError(result.message);
      triggerNativeHaptic('error');
      return;
    }
    closePreferences();
    triggerNativeHaptic('success');
  };

  if (isLoading) return <MobileShell title="마이페이지"><StatePanel role="status" description="회원 정보를 불러오고 있어요." /></MobileShell>;
  if (profileError) return <MobileShell title="마이페이지"><StatePanel role="alert" description={profileError} actions={<button className="btn-outline" type="button" onClick={() => window.dispatchEvent(new Event(AUTH_SESSION_EVENT))}>다시 시도</button>} /></MobileShell>;
  return (
    <MobileShell title="마이페이지">
      <div style={{ paddingBottom: 30 }}>
        {source === 'demo' ? (
          <div className="demo-mode-banner">
            <span>DEMO</span> 테스트 로그인 후에는 Go 회원 프로필로 저장해요.
          </div>
        ) : null}
        {/* Profile Card Header */}
        <div
          style={{
            padding: '20px 16px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Image
              alt="SummerGear 프로필"
              height={64}
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80"
              style={{ borderRadius: '50%', objectFit: 'cover' }}
              unoptimized
              width={64}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>{profile.displayName}</h2>
                <ShieldCheck size={18} color="var(--primary)" />
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                {profile.handle} · {profile.location}
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'var(--primary-light)',
                  color: 'var(--primary)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                }}
              >
                <span>신뢰도 미집계</span>
              </div>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              marginTop: 18,
              padding: '12px',
              background: 'var(--surface-subtle)',
              borderRadius: 'var(--radius-md)',
              textAlign: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary)' }}>
                {profile.transactionCount}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>수령 확인 거래</div>
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>
                {profile.savedCount}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>찜한 장비</div>
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                미집계
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>작성한 글</div>
            </div>
          </div>
        </div>

        {/* Summer Sports Preferences & Recommendation Settings */}
        <div
          style={{
            padding: '16px',
            background: 'var(--surface)',
            marginTop: 8,
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={18} color="var(--accent)" />
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>내 스포츠 & 장비 맞춤 설정</h3>
            </div>
            <button
              ref={preferencesTrigger}
              onClick={openPreferences}
              style={{
                fontSize: '0.8rem',
                color: 'var(--primary)',
                fontWeight: 700,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              수정하기
            </button>
          </div>
          {source === 'go' ? <p style={{ fontSize: '0.8rem' }}>선호 종목: {profile.preferredSport === 'surf' ? '서핑' : profile.preferredSport === 'tennis' ? '테니스' : '미설정'} · 최대 예산: {profile.maxBudgetKrw === null ? '미설정' : `${profile.maxBudgetKrw.toLocaleString()}원`} · 선호 지역: {profile.preferredRegion || '미설정'}</p> : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Surf Box */}
            <div
              style={{
                padding: '12px',
                background: 'var(--surface-subtle)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 4,
                  fontWeight: 700,
                  fontSize: '0.88rem',
                }}
              >
                <Waves size={16} color="var(--primary)" />
                <span>서핑 (Surf)</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                실력: <strong>{SURF_SKILL_LABELS[profile.surfSkill]}</strong>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                선호 스펙: <strong>{profile.surfBoardPref}</strong>
              </div>
            </div>

            {/* Tennis Box */}
            <div
              style={{
                padding: '12px',
                background: 'var(--surface-subtle)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 4,
                  fontWeight: 700,
                  fontSize: '0.88rem',
                }}
              >
                <Trophy size={16} color="var(--primary)" />
                <span>테니스 (Tennis)</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                실력: <strong>{TENNIS_SKILL_LABELS[profile.tennisSkill]}</strong>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                선호 스펙: <strong>{profile.tennisRacketPref}</strong>
              </div>
            </div>
          </div>
        </div>

        <section className="profile-notification-card">
          <span className="profile-notification-icon">
            <Bell size={20} />
          </span>
          <div>
            <strong>거래 알림</strong>
            <p>{notificationMessage}</p>
          </div>
          <div>
            <button
              className={notificationState === 'enabled' ? 'enabled' : ''}
              disabled={notificationState === 'loading'}
              onClick={() => void enableNotifications()}
              type="button"
            >
              {notificationState === 'loading' ? <LoaderCircle className="spin" size={15} /> : null}
              {notificationState === 'enabled' ? '등록됨' : '켜기'}
            </button>
            {source === 'go' ? <button type="button" disabled={notificationState === 'loading'} onClick={() => void disableNotifications()}>끄기</button> : null}
          </div>
        </section>

        {/* Menu Links */}
        <div
          style={{
            marginTop: 8,
            background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Link
            href={source === 'go' ? '/my/listings' : '/market'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid var(--border)',
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: '0.92rem',
                fontWeight: 600,
              }}
            >
              <Package size={18} color="var(--text-muted)" />
              <span>내 판매 내역</span>
            </div>
            <ChevronRight size={16} color="var(--text-subtle)" />
          </Link>

          {source === 'go' ? (
            <Link href="/seller/orders" style={{ display: 'block', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>판매 주문 처리</Link>
          ) : null}
          {source === 'go' && isReviewer ? (
            <Link href="/reviews" style={{ display: 'block', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>매물 검토</Link>
          ) : null}
          {source === 'go' && isReviewer ? (
            <Link href="/operator/sellers" style={{ display: 'block', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>판매자 신청 검토</Link>
          ) : null}
          {source === 'go' && isReviewer ? (
            <Link href="/operator/recovery" style={{ display: 'block', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>결제·작업 복구 현황</Link>
          ) : null}
          <Link
            href="/orders"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid var(--border)',
              textDecoration: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.92rem', fontWeight: 600 }}>
              <ShoppingBag size={18} color="var(--text-muted)" />
              <span>내 주문 내역</span>
            </div>
            <ChevronRight size={16} color="var(--text-subtle)" />
          </Link>
          <Link
            href={source === 'go' ? '/my/favorites' : '/market'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid var(--border)',
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: '0.92rem',
                fontWeight: 600,
              }}
            >
              <Heart size={18} color="var(--text-muted)" />
              <span>관심 / 찜 목록</span>
            </div>
            <ChevronRight size={16} color="var(--text-subtle)" />
          </Link>

          <Link
            href="/my/posts"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid var(--border)',
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: '0.92rem',
                fontWeight: 600,
              }}
            >
              <FileText size={18} color="var(--text-muted)" />
              <span>내가 쓴 커뮤니티 글</span>
            </div>
            <ChevronRight size={16} color="var(--text-subtle)" />
          </Link>

          <Link
            href="/auth"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: '0.92rem',
                fontWeight: 600,
              }}
            >
              <Settings size={18} color="var(--text-muted)" />
              <span>로그인 / 계정 관리</span>
            </div>
            <ChevronRight size={16} color="var(--text-subtle)" />
          </Link>
          {memberId ? (
            <div style={{ padding: 16 }}>
              <button className="btn-outline" type="button" onClick={() => void signOut().then((result) => { if (!result.ok) setSignOutError(result.message); })}>로그아웃</button>
              {signOutError ? <p className="form-error" role="alert">{signOutError}</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Onboarding / Preference Edit Modal */}
      {showOnboardingModal && (
        <dialog ref={preferencesDialog} className="preferences-dialog" aria-labelledby="preferences-title" onCancel={(event) => { event.preventDefault(); closePreferences(); }}>
          <div className="preferences-dialog-content">
            <button type="button" className="btn-outline preferences-close" onClick={closePreferences}>닫기</button>
            <h3 id="preferences-title" style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 4 }}>
              맞춤 추천 장비 설정
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              선호 종목·실력·예산·지역과 실제 구매 가능한 서버 매물을 비교합니다. 일치하지 않는 조건은 추천 이유에 포함하지 않습니다.
            </p>

            {source === 'go' ? (
              <div className="form-group">
                <label className="form-label" htmlFor="profile-name">표시 이름</label>
                <input className="form-input" id="profile-name" maxLength={80} value={draftDisplayName} onChange={(event) => setDraftDisplayName(event.target.value)} />
              </div>
            ) : null}
            <div className="form-group">
              <label className="form-label" htmlFor="profile-surf-skill">서핑 실력 레벨</label>
              <select
                className="form-select"
                id="profile-surf-skill"
                value={draftSurfSkill}
                onChange={(e) => setDraftSurfSkill(e.target.value as SkillLevel)}
              >
                {Object.entries(SURF_SKILL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="profile-tennis-skill">테니스 구력 / NTRP</label>
              <select
                className="form-select"
                id="profile-tennis-skill"
                value={draftTennisSkill}
                onChange={(e) => setDraftTennisSkill(e.target.value as SkillLevel)}
              >
                {Object.entries(TENNIS_SKILL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {source === 'go' ? <>
              <div className="form-group">
                <label className="form-label" htmlFor="preferred-sport">선호 종목</label>
                <select id="preferred-sport" className="form-select" value={draftSport} onChange={(event) => setDraftSport(event.target.value as 'all' | 'surf' | 'tennis')}>
                  <option value="all">미설정 (최신순)</option><option value="surf">서핑</option><option value="tennis">테니스</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="preferred-budget">최대 예산 (원, 선택)</label>
                <input id="preferred-budget" className="form-input" inputMode="numeric" value={draftBudget} maxLength={12} onChange={(event) => setDraftBudget(event.target.value)} placeholder="예: 200000" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="preferred-region">선호 거래 지역 (선택)</label>
                <input id="preferred-region" className="form-input" value={draftRegion} maxLength={120} onChange={(event) => setDraftRegion(event.target.value)} placeholder="예: 양양" />
              </div>
            </> : null}
            {preferenceError ? (
              <p className="form-error" role="alert">
                {preferenceError}
              </p>
            ) : null}
            <button
              className="btn-primary"
              disabled={isSavingPreferences}
              onClick={() => void savePreferences()}
              style={{ marginTop: 16 }}
              type="button"
            >
              {isSavingPreferences ? <LoaderCircle className="spin" size={17} /> : null}
              {isSavingPreferences ? '저장 중' : '설정 저장'}
            </button>
          </div>
        </dialog>
      )}
    </MobileShell>
  );
}

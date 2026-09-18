'use client';

import type { SkillLevel } from '@icegear/domain';
import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MobileShell } from '@/components/layout/MobileShell';
import {
  Bell,
  ChevronRight,
  FileText,
  Heart,
  LoaderCircle,
  Package,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  Waves,
} from 'lucide-react';
import { requestNativePushToken, triggerNativeHaptic } from '@/lib/native-bridge';
import { useProfile } from '@/lib/profile/use-profile';
import { registerPushToken } from '@/lib/supabase/mutations';

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
  const { profile, source, saveSkills } = useProfile();
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [draftSurfSkill, setDraftSurfSkill] = useState<SkillLevel>(profile.surfSkill);
  const [draftTennisSkill, setDraftTennisSkill] = useState<SkillLevel>(profile.tennisSkill);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const [notificationState, setNotificationState] = useState<
    'idle' | 'loading' | 'enabled' | 'error'
  >('idle');
  const [notificationMessage, setNotificationMessage] = useState(
    '거래 메시지와 검토 결과를 놓치지 않도록 알려드려요.',
  );

  const enableNotifications = async () => {
    setNotificationState('loading');
    try {
      const token = await requestNativePushToken();
      if (!token) {
        setNotificationState('error');
        setNotificationMessage('푸시 알림은 SummerGear 모바일 앱에서 켤 수 있어요.');
        return;
      }

      const result = await registerPushToken(token.token, token.platform);
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

  const openPreferences = () => {
    setDraftSurfSkill(profile.surfSkill);
    setDraftTennisSkill(profile.tennisSkill);
    setPreferenceError('');
    setShowOnboardingModal(true);
  };

  const savePreferences = async () => {
    setIsSavingPreferences(true);
    setPreferenceError('');
    const result = await saveSkills(draftSurfSkill, draftTennisSkill);
    setIsSavingPreferences(false);
    if (!result.ok) {
      setPreferenceError(result.message);
      triggerNativeHaptic('error');
      return;
    }
    setShowOnboardingModal(false);
    triggerNativeHaptic('success');
  };

  return (
    <MobileShell title="마이페이지">
      <div style={{ paddingBottom: 30 }}>
        {source === 'demo' ? (
          <div className="demo-mode-banner">
            <span>DEMO</span> 로그인하면 내 프로필과 맞춤 설정을 Supabase에 저장해요.
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
                <span>신뢰도 매너온도 99.2℃</span>
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
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>완료 거래</div>
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>
                {profile.savedCount}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>찜한 장비</div>
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                5
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
          <button
            className={notificationState === 'enabled' ? 'enabled' : ''}
            disabled={notificationState === 'loading' || notificationState === 'enabled'}
            onClick={() => void enableNotifications()}
            type="button"
          >
            {notificationState === 'loading' ? <LoaderCircle className="spin" size={15} /> : null}
            {notificationState === 'enabled' ? '켜짐' : '켜기'}
          </button>
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
            href="/market"
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

          <Link
            href="/market"
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
            href="/community"
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
        </div>
      </div>

      {/* Onboarding / Preference Edit Modal */}
      {showOnboardingModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: 'var(--surface)',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: '20px 16px 30px',
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
          >
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 4 }}>
              맞춤 추천 장비 설정
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              설정해두시면 내 체형과 실력에 맞는 장비를 홈 화면에서 추천해드립니다.
            </p>

            <div className="form-group">
              <label className="form-label">서핑 실력 레벨</label>
              <select
                className="form-select"
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
              <label className="form-label">테니스 구력 / NTRP</label>
              <select
                className="form-select"
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
              {isSavingPreferences ? '저장 중' : '저장 완료'}
            </button>
          </div>
        </div>
      )}
    </MobileShell>
  );
}

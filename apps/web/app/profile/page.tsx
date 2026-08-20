'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MobileShell } from '@/components/layout/MobileShell';
import {
  User,
  Settings,
  Heart,
  Package,
  FileText,
  Sliders,
  ChevronRight,
  ShieldCheck,
  Waves,
  Trophy,
  Sparkles,
  LogOut,
} from 'lucide-react';

export default function ProfilePage() {
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [profile, setProfile] = useState({
    displayName: '서퍼앤테니스러버',
    handle: '@summer_rider',
    location: '강원도 양양 / 서울 송파',
    surfSkill: '중급 (숏보드/펀보드)',
    surfBoardPref: '5\'11" ~ 7\'2" (32L~47L)',
    tennisSkill: '구력 3년 (NTRP 3.5)',
    tennisRacketPref: '100 sq.in, 300g, 2그립',
    transactionCount: 8,
    savedCount: 14,
  });

  return (
    <MobileShell title="마이페이지">
      <div style={{ paddingBottom: 30 }}>
        {/* Profile Card Header */}
        <div
          style={{
            padding: '20px 16px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80"
              alt="profile"
              style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
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
              onClick={() => setShowOnboardingModal(true)}
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
                실력: <strong>{profile.surfSkill}</strong>
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
                실력: <strong>{profile.tennisSkill}</strong>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                선호 스펙: <strong>{profile.tennisRacketPref}</strong>
              </div>
            </div>
          </div>
        </div>

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
              <span>계정 및 알림 설정</span>
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
                value={profile.surfSkill}
                onChange={(e) => setProfile({ ...profile, surfSkill: e.target.value })}
              >
                <option value="입문 (소프트보드/롱보드)">입문 (소프트보드/롱보드)</option>
                <option value="중급 (숏보드/펀보드)">중급 (숏보드/펀보드)</option>
                <option value="상급 (퍼포먼스 숏보드)">상급 (퍼포먼스 숏보드)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">테니스 구력 / NTRP</label>
              <select
                className="form-select"
                value={profile.tennisSkill}
                onChange={(e) => setProfile({ ...profile, tennisSkill: e.target.value })}
              >
                <option value="입문 / 1년 미만 (NTRP 1.5~2.5)">
                  입문 / 1년 미만 (NTRP 1.5~2.5)
                </option>
                <option value="구력 1~3년 (NTRP 3.0~3.5)">구력 1~3년 (NTRP 3.0~3.5)</option>
                <option value="구력 4년 이상 (NTRP 4.0+)">구력 4년 이상 (NTRP 4.0+)</option>
              </select>
            </div>

            <button
              onClick={() => setShowOnboardingModal(false)}
              className="btn-primary"
              style={{ marginTop: 16 }}
            >
              저장 완료
            </button>
          </div>
        </div>
      )}
    </MobileShell>
  );
}

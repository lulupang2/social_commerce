'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/layout/MobileShell';
import { Waves, Mail, ArrowRight, ShieldCheck } from 'lucide-react';

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSent(true);
  };

  return (
    <MobileShell title="로그인 / 회원가입" showBack hideNav>
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <Waves size={36} />
        </div>

        <h1 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: 8 }}>
          SummerGear 시작하기
        </h1>
        <p
          style={{
            fontSize: '0.88rem',
            color: 'var(--text-muted)',
            marginBottom: 30,
            lineHeight: 1.4,
          }}
        >
          서핑보드, 테니스 라켓 등 하계 스포츠 장비 거래와
          <br />
          커뮤니티를 안전하게 이용하세요.
        </p>

        {sent ? (
          <div
            style={{
              background: 'var(--surface)',
              padding: '24px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}
          >
            <ShieldCheck size={40} color="var(--success)" style={{ marginBottom: 10 }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 6 }}>
              인증 메일이 발송되었습니다
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20 }}>
              <strong>{email}</strong> 주소로 전송된 링크를 클릭하여 로그인을 완료해주세요.
            </p>
            <button onClick={() => router.push('/')} className="btn-primary">
              홈으로 이동
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label className="form-label">이메일 주소</label>
              <div className="search-input-wrapper">
                <Mail size={18} className="search-icon" />
                <input
                  type="email"
                  className="search-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn-primary" style={{ padding: '14px' }}>
              <span>이메일로 계속하기</span>
              <ArrowRight size={18} />
            </button>

            <div
              style={{
                marginTop: 20,
                fontSize: '0.78rem',
                color: 'var(--text-subtle)',
                lineHeight: 1.5,
              }}
            >
              로그인 시 SummerGear의 이용약관 및 개인정보 처리방침에 동의하게 됩니다.
            </div>
          </form>
        )}
      </div>
    </MobileShell>
  );
}

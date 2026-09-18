'use client';

import { ArrowRight, LoaderCircle, Mail, ShieldCheck, Waves } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import { triggerNativeHaptic } from '@/lib/native-bridge';
import { requestEmailSignIn } from '@/lib/supabase/auth';

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [isUnconfigured, setIsUnconfigured] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsUnconfigured(false);
    setIsSending(true);

    const result = await requestEmailSignIn(email);
    setIsSending(false);
    if (result.ok) {
      setSent(true);
      triggerNativeHaptic('success');
      return;
    }

    setError(result.message);
    setIsUnconfigured(result.reason === 'unconfigured');
    triggerNativeHaptic('error');
  };

  return (
    <MobileShell title="로그인 / 회원가입" showBack hideNav>
      <div className="auth-content">
        <div className="auth-mark">
          <Waves size={36} />
        </div>
        <p className="auth-kicker">ONE ACCOUNT · ALL SUMMER</p>
        <h1>SummerGear 시작하기</h1>
        <p className="auth-description">
          서핑보드와 테니스 라켓 거래부터 크루 커뮤니티까지 안전하게 이용하세요.
        </p>

        {sent ? (
          <div className="auth-result" role="status">
            <ShieldCheck size={40} />
            <h2>메일함을 확인해 주세요</h2>
            <p>
              <strong>{email.trim()}</strong>로 보낸 링크를 누르면 로그인이 완료돼요.
            </p>
            <button className="btn-outline" onClick={() => setSent(false)} type="button">
              다른 이메일 사용
            </button>
            <button className="btn-primary" onClick={() => router.push('/')} type="button">
              홈으로 이동
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
            <div className="form-group">
              <label className="form-label" htmlFor="auth-email">
                이메일 주소
              </label>
              <div className="search-input-wrapper">
                <Mail className="search-icon" size={18} />
                <input
                  autoComplete="email"
                  className="search-input"
                  id="auth-email"
                  maxLength={254}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </div>

            {error ? (
              <p className="form-error form-submit-error" role="alert">
                {error}
              </p>
            ) : null}

            <button className="btn-primary" disabled={isSending} type="submit">
              {isSending ? <LoaderCircle className="spin" size={18} /> : null}
              <span>{isSending ? '메일 보내는 중' : '이메일로 계속하기'}</span>
              {!isSending ? <ArrowRight size={18} /> : null}
            </button>

            {isUnconfigured ? (
              <button className="btn-outline" onClick={() => router.push('/')} type="button">
                로그인 없이 데모 둘러보기
              </button>
            ) : null}

            <p className="auth-terms">
              계속하면 SummerGear 이용약관과 개인정보 처리방침에 동의하게 돼요.
            </p>
          </form>
        )}
      </div>
    </MobileShell>
  );
}

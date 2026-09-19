'use client';

import { ArrowRight, LoaderCircle, ShieldCheck, Waves } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import { devSignIn } from '@/lib/go-auth/client';
import { triggerNativeHaptic } from '@/lib/native-bridge';

export default function AuthPage() {
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState('');

  const handleDevSignIn = async () => {
    setError('');
    setIsSigningIn(true);

    const result = await devSignIn();
    setIsSigningIn(false);

    if (!result.ok) {
      setError(result.message);
      triggerNativeHaptic('error');
      return;
    }

    triggerNativeHaptic('success');
    router.replace('/profile');
    router.refresh();
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
          현재 개발 단계에서는 Go 서비스 세션을 사용하는 임시 계정으로 로그인합니다.
        </p>

        <div className="auth-result" role="status">
          <ShieldCheck size={40} />
          <h2>개발용 임시 로그인</h2>
          <p>
            네이버·카카오 연동 전까지 테스트 회원으로 접속합니다. 로그인 이후 API는 실제 Go 세션
            쿠키를 사용합니다.
          </p>

          {error ? (
            <p className="form-error form-submit-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="btn-primary"
            disabled={isSigningIn}
            onClick={() => void handleDevSignIn()}
            type="button"
          >
            {isSigningIn ? <LoaderCircle className="spin" size={18} /> : null}
            <span>{isSigningIn ? '로그인 중' : '임시 계정으로 계속하기'}</span>
            {!isSigningIn ? <ArrowRight size={18} /> : null}
          </button>
        </div>

        <p className="auth-terms">
          임시 로그인은 테스트 환경 전용이며 실제 소셜 로그인으로 교체될 예정입니다.
        </p>
      </div>
    </MobileShell>
  );
}

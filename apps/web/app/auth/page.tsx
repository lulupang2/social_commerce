'use client';

import { useTranslate } from '@/lib/i18n/use-translate';

import { ArrowRight, LoaderCircle, ShieldCheck, Waves } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import { devSignIn, fixtureRoles } from '@/lib/go-auth/client';
import { safeReturnPath } from '@/lib/go-auth/navigation';
import { triggerNativeHaptic } from '@/lib/native-bridge';

export default function AuthPage() {
  const translate = useTranslate();
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  useEffect(() => {
    void fixtureRoles().then(setRoles);
  }, []);

  const handleDevSignIn = async () => {
    setError('');
    setIsSigningIn(true);

    const result = await devSignIn(
      selectedRole
        ? (selectedRole as 'buyer_a' | 'buyer_b' | 'seller_a' | 'seller_b' | 'reviewer')
        : undefined,
    );
    setIsSigningIn(false);

    if (!result.ok) {
      setError(result.message);
      triggerNativeHaptic('error');
      return;
    }

    triggerNativeHaptic('success');
    router.replace(safeReturnPath(new URLSearchParams(window.location.search).get('next')));
    router.refresh();
  };

  return (
    <MobileShell title={translate('로그인 / 회원가입')} showBack hideNav>
      <div className="auth-content">
        <div className="auth-mark">
          <Waves size={36} />
        </div>
        <p className="auth-kicker">ONE ACCOUNT · ALL SUMMER</p>
        <h1>{translate('SummerGear 시작하기')}</h1>
        <p className="auth-description">
          {translate('현재 개발 단계에서는 Go 서비스 세션을 사용하는 임시 계정으로 로그인합니다.')}
        </p>

        <div className="auth-result" role="status">
          <ShieldCheck size={40} />
          <h2>{translate('개발용 임시 로그인')}</h2>
          <p>
            {translate(
              '네이버·카카오 연동 전까지 테스트 회원으로 접속합니다. 로그인 이후 API는 실제 Go 세션 쿠키를 사용합니다.',
            )}
          </p>

          {roles.length > 0 ? (
            <label className="form-group">
              {translate('격리 fixture 계정')}
              <select
                className="form-select"
                value={selectedRole}
                onChange={(event) => setSelectedRole(event.target.value)}
              >
                <option value="">{translate('기존 임시 로그인')}</option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {
                      (
                        {
                          buyer_a: translate('구매자 A'),
                          buyer_b: translate('구매자 B'),
                          seller_a: translate('판매자 A'),
                          seller_b: translate('판매자 B'),
                          reviewer: translate('검토 운영자'),
                        } as Record<string, string>
                      )[role]
                    }
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {error ? (
            <p className="form-error form-submit-error" role="alert">
              {translate(error)}
            </p>
          ) : null}

          <button
            className="btn-primary"
            disabled={isSigningIn}
            onClick={() => void handleDevSignIn()}
            type="button"
          >
            {isSigningIn ? <LoaderCircle className="spin" size={18} /> : null}
            <span>
              {isSigningIn ? translate('로그인 중') : translate('임시 계정으로 계속하기')}
            </span>
            {!isSigningIn ? <ArrowRight size={18} /> : null}
          </button>
        </div>

        <p className="auth-terms">
          {translate('임시 로그인은 테스트 환경 전용이며 실제 소셜 로그인으로 교체될 예정입니다.')}
        </p>
      </div>
    </MobileShell>
  );
}

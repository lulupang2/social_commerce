'use client';

import { useTranslate } from '@/lib/i18n/use-translate';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getGoSession } from '@/lib/go-auth/client';
import { isProtectedPage, redirectToLogin } from '@/lib/go-auth/navigation';

export function LoginGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return isProtectedPage(pathname) ? (
    <ProtectedPage key={pathname}>{children}</ProtectedPage>
  ) : (
    children
  );
}

function ProtectedPage({ children }: { children: ReactNode }) {
  const translate = useTranslate();
  const [checked, setChecked] = useState<{ error: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void getGoSession().then((result) => {
      if (!active) return;
      if (!result.ok && result.status === 401) {
        redirectToLogin();
        return;
      }
      setChecked({ error: result.ok ? '' : result.message });
    });
    return () => {
      active = false;
    };
  }, [retry]);

  const error = checked?.error;
  if (error === '') return children;
  return (
    <div className="app-viewport">
      <main className="main-content">
        <div className="empty-state" role={error ? 'alert' : 'status'}>
          <p>{error || translate("로그인 상태를 확인하고 있어요.")}</p>
          {error ? (
            <button
              className="btn-outline"
              type="button"
              onClick={() => {
                setChecked(null);
                setRetry((value) => value + 1);
              }}
            >
              {translate("다시 시도")}</button>
          ) : null}
        </div>
      </main>
    </div>
  );
}

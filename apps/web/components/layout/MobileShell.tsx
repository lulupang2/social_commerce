import React from 'react';

import { BottomNav } from './BottomNav';
import { TopNav } from './TopNav';

interface MobileShellProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
  hideNav?: boolean;
  storefront?: boolean;
}

export function MobileShell({
  children,
  title,
  showBack,
  hideNav = false,
  storefront = false,
}: MobileShellProps) {
  return (
    <div className={'app-viewport' + (storefront ? ' storefront-viewport' : '')}>
      <TopNav storefront={storefront} title={title} showBack={showBack} />
      <main className={'main-content' + (hideNav ? ' main-content-no-nav' : '')}>{children}</main>
      {!hideNav && <BottomNav />}
    </div>
  );
}

import React from 'react';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';

interface MobileShellProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
  hideNav?: boolean;
}

export function MobileShell({ children, title, showBack, hideNav = false }: MobileShellProps) {
  return (
    <div className="app-viewport">
      <TopNav title={title} showBack={showBack} />
      <main className="main-content">{children}</main>
      {!hideNav && <BottomNav />}
    </div>
  );
}

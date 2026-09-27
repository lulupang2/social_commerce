import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { referrer: 'no-referrer' };

export default function OrderLayout({ children }: { children: ReactNode }) {
  return <div className="order-viewport">{children}</div>;
}

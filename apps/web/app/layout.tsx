import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { LoginGate } from '@/components/layout/LoginGate';
import { NavigationHistory } from '@/components/layout/NavigationHistory';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const english = (await getLocale()) === 'en';
  return {
    title: english ? 'SummerGear - Summer sports gear marketplace & community' : 'SummerGear - 하계 스포츠 장비 중고거래 & 커뮤니티',
    description: english ? 'Buy and sell surf and tennis gear, discover recommendations, and join the community.' : '서핑, 테니스 등 하계 스포츠 장비 거래와 맞춤 추천, 커뮤니티까지 한 곳에서 즐기세요.',
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0284c7',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body><NextIntlClientProvider><Suspense fallback={null}><NavigationHistory /></Suspense><LoginGate>{children}</LoginGate></NextIntlClientProvider></body>
    </html>
  );
}

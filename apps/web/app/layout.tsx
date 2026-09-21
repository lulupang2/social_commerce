import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SummerGear - 하계 스포츠 장비 중고거래 & 커뮤니티',
  description:
    '서핑, 테니스 등 하계 스포츠 장비 거래와 맞춤 추천, 커뮤니티까지 한 곳에서 즐기세요.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0284c7',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

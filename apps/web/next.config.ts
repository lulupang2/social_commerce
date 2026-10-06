import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const goApiOrigin = process.env.SUMMERGEAR_GO_API_ORIGIN?.replace(/\/$/, '');

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost', '10.0.2.2'],
  async rewrites() {
    if (!goApiOrigin) return [];
    return [
      {
        source: '/api/v1/:path*',
        destination: `${goApiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default createNextIntlPlugin()(nextConfig);

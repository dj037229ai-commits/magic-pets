import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允許外部 tunnel URL 接收 HMR 更新（開發用）
  allowedDevOrigins: [
    '*.lhr.life',
    '*.localhost.run',
    '*.ngrok.io',
    '*.ngrok-free.app',
  ],

  // PWA: Service Worker 正確 headers
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
          },
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

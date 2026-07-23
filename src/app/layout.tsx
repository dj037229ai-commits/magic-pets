import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegistration from '../components/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: '魔法寵物 | MISTRY PETS',
  description: '照顧專屬魔法寵物、抽取每日小語，和寵物一起玩可愛小遊戲。',
  manifest: '/manifest.webmanifest',
  applicationName: '魔法寵物',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '魔法寵物',
  },
  icons: {
    icon: [
      { url: '/icons/magic-pets-forest-fox-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/magic-pets-forest-fox-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/magic-pets-forest-fox-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/magic-pets-forest-fox-180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#6f58cf',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}

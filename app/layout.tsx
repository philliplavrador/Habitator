import type { Metadata, Viewport } from 'next';
import { Inter, Sora, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import TimezoneSync from '@/components/TimezoneSync';
import Providers from '@/components/providers/Providers';
import BottomNav from '@/components/BottomNav';

// Self-hosted at build time (served same-origin from /_next/static) — no runtime
// request to Google, so it works offline/as a PWA with no CSP concern.
const body = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});
const display = Sora({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
  // Only the body font (Inter) is preloaded on cold load; display/mono fall
  // back to `swap` and load on demand — trims contending woff2 with no visual
  // change (`font-display: swap` still applies once loaded).
  preload: false,
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-mono',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'Habitator',
  description: 'A minimalist personal habit tracker.',
  applicationName: 'Habitator',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Habitator',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  themeColor: '#0b0d10',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable} ${mono.variable}`}
    >
      <body>
        <Providers>
          <TimezoneSync />
          <div className="safe-top mx-auto w-full max-w-md px-4">{children}</div>
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}

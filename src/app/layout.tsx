import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'CloudDojo — Cloud Certification Training',
  description: 'AI-powered scenario-based exam questions for GCP and Google Workspace certifications. Train smarter, certify faster.',
  manifest: '/manifest.json',
  appleWebApp: {
    statusBarStyle: 'black-translucent',
    title: 'CloudDojo',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

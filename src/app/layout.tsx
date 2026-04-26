import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { JetBrains_Mono, Outfit } from 'next/font/google';
import DemoBanner from '@/components/DemoBanner';
import { Toaster } from 'sonner';
import { APP_DISPLAY_NAME } from '@/lib/branding';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-ui-sans',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: APP_DISPLAY_NAME,
  description: 'AI Agent Orchestration Dashboard',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className={`${outfit.className} bg-mc-bg text-mc-text min-h-screen touch-action-manipulation`}>
        <DemoBanner />
        <Toaster 
          position="bottom-center" 
          theme="dark"
          toastOptions={{
            style: {
              background: '#1a1a2e',
              border: '1px solid #3d3d5c',
              color: '#e4e4e7',
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}

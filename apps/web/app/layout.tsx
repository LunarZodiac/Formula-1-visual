import type { Metadata } from 'next';
import { BackToTop } from './components/back-to-top';
import { SiteHeader } from './components/site-header';
import { SiteFooter } from './components/site-footer';
import './globals.css';

export const metadata: Metadata = {
  title: 'География скорости — интерактивный атлас Formula 1',
  description:
    'Интерактивный картографический атлас географии и истории Formula 1',
  openGraph: {
    title: 'География скорости — интерактивный атлас Formula 1',
    description:
      'Интерактивный картографический атлас географии и истории Formula 1',
    type: 'website',
  },
  icons: { icon: '/icon.svg', shortcut: '/icon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
        <BackToTop />
      </body>
    </html>
  );
}

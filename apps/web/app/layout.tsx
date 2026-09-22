import type { Metadata } from 'next';
import { BackToTop } from './components/back-to-top';
import { SiteHeader } from './components/site-header';
import { SiteFooter } from './components/site-footer';
import { ThemeProvider } from './components/theme-provider';
import '@fontsource-variable/golos-text';
import '@fontsource-variable/unbounded';
import './globals.css';

const themeInitializationScript = `
(() => {
  let saved;
  try { saved = localStorage.getItem('f1-atlas-theme'); } catch {}
  let prefersLight = false;
  try { prefersLight = matchMedia('(prefers-color-scheme: light)').matches; } catch {}
  const theme = saved === 'light' || saved === 'dark'
    ? saved
    : prefersLight ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();`;

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
    <html lang="ru" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body>
        <ThemeProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
          <BackToTop />
        </ThemeProvider>
      </body>
    </html>
  );
}

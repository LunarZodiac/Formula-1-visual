import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'F1 Geovisual Atlas — география скорости',
  description:
    'Интерактивный картографический атлас географии и истории Formula 1.',
  openGraph: {
    title: 'F1 Geovisual Atlas',
    description:
      'Интерактивный картографический атлас географии и истории Formula 1.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const CANONICAL_APP_URL = 'http://5.104.83.211';

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_APP_URL),
  title: 'StockInsider',
  description: 'Taiwan story-driven opportunity radar for underpriced 1-3 month setups',
  alternates: { canonical: '/' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}

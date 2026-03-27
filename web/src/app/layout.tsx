import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StockInsider',
  description: 'Taiwan story-driven opportunity radar for underpriced 1-3 month setups',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}

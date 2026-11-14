import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

const CANONICAL_APP_URL = 'http://5.104.83.211';

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
      <body className="antialiased" suppressHydrationWarning>
        <nav aria-label="帳號入口" className="mx-auto flex max-w-7xl justify-end px-5 pt-4 text-sm">
          <Link href="/private-research" prefetch={false} className="text-sky-700 underline underline-offset-4 dark:text-sky-300">私人研究</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}

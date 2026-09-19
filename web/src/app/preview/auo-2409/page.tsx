import type { Metadata } from 'next';
import AuoDeepDiveReport from './AuoDeepDiveReport';
import './report.css';

export const metadata: Metadata = {
  title: '友達 2409 深度研究｜StockInsider',
  description: '友達三大事業、財務預估、Forward P/E、P/B 與技術進場條件的版本化深度研究。',
};

export const dynamic = 'force-static';

export default function AuoPreviewPage() {
  return <AuoDeepDiveReport/>;
}

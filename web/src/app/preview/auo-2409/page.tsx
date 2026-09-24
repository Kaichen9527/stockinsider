import type { Metadata } from 'next';
import AuoDeepDiveReport from './AuoDeepDiveReport';
import './report.css';

export const metadata: Metadata = {
  title: '友達 2409 研究示範｜StockInsider',
  description: '以友達為示範，呈現產業、技術、訂單證據、財務估值與進場條件的研究方向。',
};

// Re-evaluate technical freshness on every request. The research revision is
// immutable, but executable price levels must disappear after seven days.
export const dynamic = 'force-dynamic';

export default function AuoPreviewPage() {
  return <AuoDeepDiveReport/>;
}

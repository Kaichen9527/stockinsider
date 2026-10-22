import { VnextHomeView } from './components/vnext/Home';
import { vnextEnabled } from '@/lib/vnext/policy';
export default function Loading() { return vnextEnabled() ? <VnextHomeView data={null} loading /> : <p role="status" className="p-6">資料載入中</p>; }

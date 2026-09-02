import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveMarketEvidence } from './market-evidence.ts';

test('market evidence requires both indices, breadth and official flows', () => {
  const sessions = Array.from({ length: 520 }, (_, index) => ({ date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`, close: 100 + index }));
  const latest = sessions.at(-1)!.date;
  const evidence = deriveMarketEvidence({ sessionDate: latest, taiex: sessions, tpex: sessions, breadth: [
    { market: 'TWSE', numerator: 900, observed: 1000, eligible: 1000, date: latest },
    { market: 'TPEX', numerator: 700, observed: 800, eligible: 800, date: latest },
  ], foreignFlows: sessions.slice(-5).map((row) => ({ date: row.date, value: 1 })) });
  assert.equal(evidence.status, 'complete');
  assert.equal(evidence.regime, 'risk_on');
  assert.deepEqual(evidence.missingComponents, []);
});

test('missing market component disables risk budget', () => {
  const evidence = deriveMarketEvidence({ sessionDate: '2026-09-01', taiex: [], tpex: [], breadth: [], foreignFlows: [] });
  assert.equal(evidence.status, 'data_incomplete');
  assert.equal(evidence.riskBudget, null);
  assert.ok(evidence.missingComponents.length === 4);
});

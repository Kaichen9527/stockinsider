import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateStatementKind, requiredAcquisitionPeriods, financialWorkCompleteness, financialLastAttemptByStock } from './candidate-financial-work-plan.ts';

test('statement routing distinguishes manufacturers, brokers and financial issuers', () => {
  assert.equal(candidateStatementKind('台積電','半導體'), 'general');
  assert.equal(candidateStatementKind('宏遠證券','證券業'), 'broker');
  assert.equal(candidateStatementKind('第一金控','金融'), 'financial');
  assert.equal(candidateStatementKind('保險公司','insurance'), 'financial');
});
test('field-period backlog requests only actual gaps and fiscal YTD prerequisites', () => {
  const issuer = { stockId: 'one', symbol: '2330', gaps: [
    { factKey: 'quarterly_diluted_eps', periodEnd: '2025-06-30' },
    { factKey: 'diluted_weighted_average_shares', periodEnd: '2025-06-30' },
  ] };
  assert.deepEqual(requiredAcquisitionPeriods(issuer, ['2020-12-31']), ['2025-06-30','2025-03-31']);
  assert.deepEqual(requiredAcquisitionPeriods({ ...issuer, gaps: [] }, ['2020-12-31']), []);
});
test('execution success is not field completion and newly required fields remain explicit', () => {
  const a = { factKey: 'quarterly_revenue', periodEnd: '2025-06-30' };
  const b = { factKey: 'quarterly_diluted_eps', periodEnd: '2025-06-30' };
  assert.deepEqual(financialWorkCompleteness([a], [b]), {
    requiredFieldPeriods: 1, missingFieldPeriods: 1, completedFieldPeriods: 1,
    status: 'incomplete', missing: ['quarterly_diluted_eps:2025-06-30'],
  });
});
test('issuer rotation counts pending document attempts and maximum across endpoints, not row order', () => {
  const rows = [
    { stock_id:'one',last_attempted_at:'2026-09-11T10:00:00Z' },
    { stock_id:'one',last_collected_at:'2026-09-10T10:00:00Z' },
    { stock_id:'two',last_collected_at:'2026-09-09T10:00:00Z',updated_at:'2026-09-12T10:00:00Z' },
  ];
  assert.deepEqual(financialLastAttemptByStock(rows),financialLastAttemptByStock([...rows].reverse()));
  assert.equal(financialLastAttemptByStock(rows).get('one'),Date.parse('2026-09-11T10:00:00Z'));
  assert.equal(financialLastAttemptByStock(rows).get('two'),Date.parse('2026-09-09T10:00:00Z'));
});

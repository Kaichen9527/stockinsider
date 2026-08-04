# Acceptance Tests: actionable-entry-revaluation-broker-upgrade

## Required Checks

```bash
cd web && npm run lint
cd web && npm run build
npm run audit:entry-buy-actionability-v2 -- --base-url http://127.0.0.1:3012
npm run audit:revaluation-sla-v2 -- --base-url http://127.0.0.1:3012
npm run audit:scenario-promote-to-base-v2 -- --base-url http://127.0.0.1:3012
npm run audit:broker-evidence-radar-v2 -- --base-url http://127.0.0.1:3012
```

## Pass Criteria

- Visible stocks are not all hard-blocked without explicit hard reasons.
- Any visible `待重估` state has a job, attempt/result, missing evidence, or next attempt.
- High scenario progress or Base-crossed stocks are promoted, queued, unchanged with reason, or blocked with evidence gap.
- Broker evidence search status is visible for relevant queued/pending candidates.
- Formal Gate remains strict.

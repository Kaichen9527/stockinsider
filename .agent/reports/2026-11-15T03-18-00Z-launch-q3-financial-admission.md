# Q3 availability from public filing to financial acquisition

A scoped read-only Contabo transaction checked the live financial cache, candidate validation receipts and document receipts for two actual companies. Public originals were already independently observed. 2317's 11/12 investor material states single-quarter and year-to-date EPS separately. 5274's 11/11 filing includes separate original/restated figures. The private system is a different clock.

| Issuer | Q3 fact candidates by the 11/12 and 11/13 21:30 cutoffs | Q3 fact candidates at the later check | Q3 jobs indexed by period at the later check |
|---|---:|---:|---:|
| 2317 | 0 / 0 | 0 | 0 |
| 5274 | 0 / 0 | 0 | 0 |

Q3 also had no complete accepted document receipts for these two subjects. The previous Q2 period contained 15 candidate facts and no validation marks in the inspected scope for 2317, and 29 candidates with 14 marks for 5274. These are counts from the limited query. They do not grant human or app financial authority, and cannot be mistaken for the current third quarter.

The current [queue drain](https://github.com/Kaichen9527/stockinsider/blob/dd59817f750684b093965f539dd4de466be13077/web/src/app/api/internal/candidate-financial-queue-drain/route.ts#L53-L104) obtains stocks from due jobs and calls refresh with `enqueueMissing: false`. Rerunning that drain alone does not submit missing-Q3 jobs. The upstream normal writer path must be traced and closed before qualifying these Q3 inputs, then the existing owned lease, original receipt/parser evidence, fact versions, validation and independent review apply. This observation proves no such row in these tables at the check. It does not infer why a particular upstream run omitted it, or whether an original exists in other private storage.

The Codex VM [financial source slice](https://github.com/Kaichen9527/stockinsider/commit/72482e18029c064936a37ab734d5a3fbf54a03ec) and its [fixed test receipt](https://github.com/Kaichen9527/stockinsider/commit/27f5630f0e0e58f87705e9c0f250e3aed6346396) cover TypeScript normalization, related tests and build. The source explicitly retains SQL interval/basis parity as a gap. No Q3 enqueue, writer, paid model call, production migration or historical re-ranking ran in this check.

[2317 filing and valuation-vintage control](https://github.com/Kaichen9527/stockinsider/commit/e50842f3a7fd41a12d57fc9d7d1522dc19ffdc2a) · [5274 original and restated-period control](https://github.com/Kaichen9527/stockinsider/commit/019432593cdc157429c6cdc47ecb4d826864e512).

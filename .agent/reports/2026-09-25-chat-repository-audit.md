# StockInsider — Chat repository audit, 2026-09-25

## Delivery boundary

This is an executed repair/audit, not a claim that the whole product is finished.
Main was `169aad1b6cfa747f78ae3464b614f43c0749d806`. Work is on
`codex/tw-strategy-lab-v1` / PR #284. **Main merge, production deployment,
current authoritative candidate export, article publication and trading activation
have not been performed.** Do not turn diagnostic CI success into protected approval.

## Commits actually delivered

| Commit | Change |
| --- | --- |
| `02608c000c70b2fbad494dbb66c740f9742898db` | Fail-closed research-engine input contract and 32 regression tests. |
| `d976849fbebf266ecc8a4f0d49adfedb9d818feb` | Separate offline CI from explicitly dispatched frozen development acquisition/research. |
| `bbb68af132c15d6db572b8ab189ad67e29445f8d` | Isolate PR tests from the old long-running acquisition concurrency group. |
| `b2b5d24c8656aaff2e859f17f9773eea7a609584` | Bounded public stage-pagination observer, 18 tests and an expiring explicit GET request. |
| `9bba31c7d87879f375a278c092008b066f177d2b` | Merge the seven non-overlapping AUO draft files from PR #283 into #284, preserving their exact blobs and source parent. |

The commit containing this report also retains the complete 176-row compact public
roster, an offline reproducer, six reproduction tests and an editorial-source audit.
The reproducer deliberately labels its output as a derived CSV projection rather
than fabricating the raw HTTP observation or the omitted individual read timestamps.

### Reproduced accounting defect

On a synthetic 2023 example, one cash-dividend event produced receivables of TWD9,000
and terminal equity of TWD9,994,748.50. Duplicating the same event produced TWD18,000
and TWD10,003,748.50. The pre-fix engine counted the dividend twice. The repair
rejects duplicate or conflicting same-symbol/action-date events before any accounting.
This does **not** establish that the retained historical dataset contains duplicates.

Also rejected: NaN/infinite/bool numeric inputs, invalid lot sizes and calendar dates,
duplicate/unsorted OHLC bars, impossible OHLC geometry, invalid liquidity, duplicate
eligible signals, malformed orders/payment dates and 2024+ holdout tails hidden
outside the requested interval. Missing bars, halted sessions, missing turnover,
non-executable signals and passive-control zero stops keep their explicit semantics.
The valid synthetic result's canonical SHA256 remains
`d09593e7397b86a1f4e01e3c2e418c7d42c881d9de698f6105f90be46af0016c`.

## Test and artifact evidence

| Evidence | Actual scope |
| --- | --- |
| Local research suite | 143/143, including 32 admission tests and six new CSV-reproduction tests. |
| Earlier exact-head CI research suite | 137/137 on `bbb68af`; not 274 different tests when also run locally. |
| Public observer | 18/18 synthetic tests locally and on GitHub; live acquisition separately evidenced below. |
| Entry-plan regression | 100/100 locally with actual Node, not fabricated process output. |
| GitHub product/runtime run `36141160564` | Success on `bbb68af`: real dependencies, PostgreSQL, financial/runtime suites, TypeScript, lint, production build and browser checks. Diagnostic evaluation/model tracks skipped; not root-gate approval. |
| Integration CI | Product/runtime run `36145199730` succeeded on `9bba31c`; research run `36145199911` and observer run `36145199820` also succeeded. Later commits require their own checks. |

Local full financial/KOL suites could not load uncached Supabase/pg dependencies;
`npm ci --offline` failed on uncached xtend. Those local failures are not counted as
passes. Real GitHub dependency installation and the product workflow provide the
separate successful evidence above. No test or gate was removed to manufacture green.

A complete 1,639-file tracked-source archive was obtained from run `36141160566`,
artifact `10865989998`, and checked before extraction. Its ZIP SHA256 is
`e34007b5bc584326d9111b1c187811b5036a59d08e7461d30a5288928c044a14`.
The source artifact identifies `bbb68af` and tree `ea5b6e6afec59140422866d6167fdd8c1f5221a5`.
No local git identity was invented for the extracted archive.

## Public roster: 176 observed cards, not 176 approved investments

Actual GET run `36143407307`, artifact `10868356621`, observed at
`2026-09-25T13:49:39.217683+00:00`, consumed eight bounded requests. All public
found/waiting/actionable pages matched publication
`2026-09-25T15:27:18.599+02:00`; **176/176 distinct cards** were reconciled.
The earlier 40/196 observation is a different snapshot and is retained unchanged.
The new roster shares 39 old observed symbols and adds 137 observed symbols;
8039 is absent from this new public snapshot. That is not an authorized deletion.

The source content date remains **2026-09-12**. All final responses used the known
HTTP redirect, without authenticated TLS transport. Projection-health fields in this
new response were not supplied; do not copy the earlier response's health labels
onto this one. Public card revisions are not database-authoritative revisions.
`6000` appears with name `6000` and no detail revision: preserve it as an unresolved
public-data anomaly, not a verified listed common stock or a guessed correction.

The original offline run produced **176 Markdown drafts and 176 non-executable
queue entries; all 176 blocked, zero preview-ready, zero published**. These are
per-card research/missing-data checklists, not 176 completed investment articles.
Their old portfolio research reference is not current per-stock performance.

Raw observation SHA256:
`672a721579f5098cdc1be946c82b5592579d15b7afa037734ad570305aa60124`.
Original GitHub artifact ZIP SHA256:
`7b639da7c9036e9a107954722de383530e003fd68eef53d8cd77bc24dd2a1de9`.
The original ZIP and original generated drafts are delivered as conversation files;
Git retains the exact compact CSV (SHA256 below) and reproducible draft code, not a
renamed or truncated ZIP masquerading as the original observation.

CSV: `research/tw-strategy-lab/sources/public-roster-20260925T134939Z.csv`.
SHA256: `1e24943467ac3053b4e163027b916f66f6fda79e0c73355055559e672791d853`.
Reproducing from it omits individual read timestamps and therefore intentionally
has a different snapshot/draft hash from the original full-observation artifact.
It must still produce 176 blocked drafts and zero executable publication entries.

```sh
python3 -m unittest discover -s research/tw-strategy-lab -p 'test_*.py' -v
python3 -m unittest discover -s scripts -p 'test_public_roster_observer.py' -v
python3 research/tw-strategy-lab/reproduce_public_preview.py \
  --output-dir /tmp/stockinsider-public-176-new
```

Use a new output directory. The command neither re-fetches the public site nor
accesses a database. The original S1-S7 research artifacts remain immutable.

## PR housekeeping and integration

At the initial audit there were zero ordinary open issues and six open PRs.
Four old PRs were closed with specific evidence, without deleting their branches:

- #228: old v3.16 oracle-reuse evidence is not current v3.18 host evidence.
- #215: its parser stack is incorporated by merged #217, merge `81b5f9e6e1be8547804aa44b07e776e56a4023f0`, followed by newer fact-scoped fixes.
- #138 and #140: functionally superseded by merged #143, merge `9bd4f24daf4f8a968a2a809ca020e3677fd57ed0`, and later main repairs. Divergent branch history was not misrepresented as byte-identical ancestry.

#283's seven files are incorporated unchanged in merge `9bba31c`. It can be retired
as incorporated after combined-head checks, without calling it merged to main.
Its original parent is `c6388fd73efa38351d0d6d6b95cf84cd4f48f1a8`.
#284 remains the consolidated candidate, not an approved release.

## What is genuinely unfinished

1. **Exact-head independent review and protected gate.** Ruleset `20177392` requires
   `stockinsider-v3-gate-root`; bypass actors are empty and current-user bypass is
   never. Actual run `36143403501`, job `108098553916`, failed because
   `refs/heads/evidence/source-led-opportunity-v3-exact-review-b2b5d24c8656aaff2e859f17f9773eea7a609584`
   does not exist. A later head requires its own genuine evidence. Do not fabricate
   that ref, relabel an old artifact, approve the author's own work or disable checks.
   The approved oracle pins a signed macOS executable at
   `/Applications/ChatGPT.app/Contents/Resources/codex`, exact version
   `codex-cli 0.155.0-alpha.16.3` and v3.18 file identities. This Chat Linux runtime
   has no such host, codex executable or connected SSH control. An approved local
   Work/host execution and independent review is the concrete next blocker to main.
2. **Current data and editorial acceptance.** Obtain the guarded authoritative
   candidate export, security-master identity, current point-in-time availability,
   valid trade-plan bar receipts, licensed report rights and source-backed articles.
   The public CSV cannot authorize writes. Resolve the 6000 placeholder and stale
   9/12 content against actual records, not guessing. Article production/publishing
   must use the existing authenticated, revision-checked workflow after review.
3. **Research v2.1 is not executed or accepted.** Its exact proposal hash remains
   `4379960b4d1406bee97fcf54fa0f99e832abdefa1ed9a5111d04f2d25748270a`.
   Restore the exact normalized dataset, obtain a different reviewer's acceptance,
   then implement/verify the finite R1-R4 runner against that contract. These new
   paths are not already complete merely because the specification has 42 checks.
   Freshly downloaded historical data is not automatically the old dataset.
   S5/S7 still lack eligible point-in-time history/rights. No 2024+ holdout was opened,
   no new robustness winner selected and no elapsed cohort evidence fabricated.
4. **Runtime/data deployment remains last.** Re-measure Contabo capacity under
   current locks and workload; the old projected 9.9 GiB is not a current reading
   and does not satisfy the 15 GiB floor. Follow reviewed migration rehearsal,
   exact runtime activation, two terminal/idempotent producer runs and read-only
   production/Safari smoke. No purchase, deletion, password reset or deployment
   was made here. Existing code for these steps must be reused, not rewritten from
   obsolete Vercel-era checklist sections.

Current release state still requires exact review, migration/runtime evidence,
production smoke and release closure. Historical `superseded/do_not_execute`
checklists are not fresh implementation backlog. Completed entry-plan and financial
parser code is not equivalent to complete current production data.

## Source work retained separately

See `research/tw-strategy-lab/sources/editorial-source-review-2026-09-25.json` and
`research/tw-strategy-lab/reports/editorial-source-review-2026-09-25.md`.
The audit distinguishes a genuinely opened BOE filing/Corning release from indexed
AUO/TSMC/UMC leads and stale cached monthly pages. No full third-party article,
paid report, credential, font file or invented source-content hash is committed.

## Exact next handoff

Continue from PR #284's actual current head. Preserve local work and read this audit,
AGENTS/Loop policy and the current release state. Run the existing approved-host
preflight and genuine independent exact-head review; resolve findings and rerun
normal protected checks. Merge only when the current head is admitted. Do not reuse
#228, change the ruleset, reimplement the repaired parser or claim the 176 blocked
checklists are finished investment analyses. Only then obtain the guarded current
snapshot and perform the separately reviewed capacity/migration/data/publication
steps; leave real rights, missing history and elapsed-time blockers explicit.

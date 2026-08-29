# V3.20 fresh Requirements review — KOL-first runtime recovery

Date: 2026-08-29

Review authority: one independent, read-only Requirements review of the
immutable V3.20 implementation tree. No production database, scheduler,
Vercel deployment, provider acquisition, Safari state, LINE, dispatch,
automatic trading, Promotion, or evaluation-governance state was mutated.

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Parent commit/tree: `501dc2fba28d06731a85469ba3fbc4b8f250528c` /
  `f6fdfb8c3f1c3cbb46582c0c1c767b3870fd31ed`
- Final reviewed implementation commit/tree: `c783f8171233efd77adf21405fe91723e48b318c` / `9b87d174de9c71cf5dac9e6e59d68f3d0ad3fd6c`
- Full reviewed range: `501dc2fba28d06731a85469ba3fbc4b8f250528c..c783f8171233efd77adf21405fe91723e48b318c`
- Active graph: `13081345293dcb3306c68420270ca82ea090fa18a0ecb878ccd8da08d63e0587`
- Scope: recovery of the expired producer lease, KOL-first nomination and
  acquisition, exact source authority, projection visibility, and the
  graph/evidence binding that prevents V3.20 from reusing V3.19 review proof.

## Requirement closure

- A lost lease is terminalized only for the exact run, leased job, commit,
  worker and config identity; the reaper writes a durable redacted diagnostic
  and a recoverable terminal instead of leaving a stuck `running` state.
- Only approved KOL content, official Threads posts by approved authors,
  public Telegram, rights-attested InvestAnchors claims, or attested Research
  Inbox claims can nominate a symbol. Official market data can corroborate or
  veto but cannot nominate or retain a card alone.
- The acquisition matrix has five connectors with one honest terminal outcome
  per expected profile/connector. OAuth failures, metadata-only material and
  unavailable endpoints stay visible as typed non-thesis outcomes.
- Entity linking requires ticker plus company/name/context evidence, so
  `新興市場 ETF` cannot create a false link to 新興 2605.
- A stale projection preserves its same-revision card and dossier but disables
  action authority. Missing authority becomes research/data-needed rather
  than a fabricated target or an `avoid` conclusion.
- The V3.20 amendment is now in the active artifact graph. The protected gate
  maps that graph to V3.20 Requirements and Architecture evidence; it cannot
  silently substitute the V3.19 evidence chain.

## Executable evidence examined

- Product/runtime correctness: `149/149` PASS, including PCR-001 through
  PCR-031, KOL-only nomination, 2605 rejection, five-connector conservation,
  lease reaping and projection exclusion of legacy official-only cards.
- Migration contract/rehearsal: `74/74` PASS, including apply-twice,
  production-like predecessor delegation, and the KOL authority catch-up
  occurrence across its deterministic whole-second cutoff.
- Source-led core: `63/63` PASS; legacy V1/V2: `2/2` PASS; browser: `9/9`
  PASS; performance: `5/5` PASS.
- Typecheck, lint, production build, protected-worker tests and
  `git diff --check` PASS.

This PASS authorizes exactly one independent Architecture review. It does not
authorize production migration, runtime activation, Vercel deployment, a
claim of future returns, or any prohibited action.

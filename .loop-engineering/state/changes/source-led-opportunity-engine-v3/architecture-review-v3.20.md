# Source research / Shadow v2 Architecture review — signed host compatibility

Date: 2026-09-02

Review authority: one independent, read-only Architecture review after the
Requirements PASS. No production database, scheduler, Vercel project, VPS
runtime, provider, trading, or evaluation-governance state was mutated.

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Requirements-reviewed parent/tree: `90de150b4fb3e15d5b1605acdadf4565fc439661` / `8f79a4275442b742bb9c5bfd7991a2653ef3339c`
- Final reviewed implementation commit/tree: `fa523ba1e569409c30e716f311bcfc3db8552da1` / `f16c8eddec2553b5c9d1e86497872d0268a4894c`
- Full reviewed implementation range: `9add16e5b2144613f237fa7246e5be323dbc838d..fa523ba1e569409c30e716f311bcfc3db8552da1`
- Active graph: `81dceab0d17b6c0f0c104ee3376f6d1dc5065a283040a4c1ee0ac40f574580d4`

## Architecture result

- The VPS is the single production writer. Database lease fencing is below
  every source write path, while Vercel redirects and workflow changes remove
  competing scheduled writers without removing manual recovery.
- Source connectors terminate independently into one registry/ledger plane.
  Typed dispositions preserve honest health and isolate provider failures.
- Official PIT facts, price/multiple histories and one market snapshot feed the
  candidate-research cycle. The valuation router refuses unsupported forward
  labels and the classifier fails closed when market evidence is incomplete.
- Candidate summaries and full dossiers are append-only revisions. Public Radar
  reads one compact atomic snapshot; details resolve independently by revision,
  so a missing legacy decision no longer creates an empty stock page.
- Shadow v2 binds a frozen manifest, per-symbol terminals, detail publication
  and Radar payload hash in causal order. Same-manifest replay drift conflicts;
  late source arrival does not masquerade as model instability.
- Deterministic research remains authoritative. Codex enrichment can only cite
  frozen fact IDs, cannot mutate scores or stages, and can fall back to the
  last-good factual dossier.
- The host compatibility change binds one exact signed Codex/App identity and
  propagates its digest through preflight, runner identity and journals. It
  changes no sandbox, network, route, model or production authority.

## Verified evidence

- Model-runner suite `21/21` and live signed-host preflight PASS.
- Product/runtime `150/150`, candidate/Shadow `57/57`, source ranking
  `53/53`, migration `78/78`, runtime/gate `63/63` and legacy `2/2`
  passed for the feature implementation.
- TypeScript, lint, production build, migration apply-twice and exact tree
  review passed before this evidence-only commit. The compatibility amendment
  changes only its closed host-dependent track.
- Review inspected writer bypass, connector error collapse, stale actionable
  authority, point-in-time leakage, fabricated valuation, publication ordering,
  dossier trust boundaries, shadow replay, and cache invalidation. No P0/P1/P2
  finding remains.

This PASS authorizes exactly one exact-commit review. It does not authorize
production migration, deployment, runtime activation, a claim of future
returns, or any prohibited action.

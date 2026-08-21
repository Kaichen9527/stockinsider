# V3.17 Architecture candidate-probe repair-closure review

Date: 2026-08-21

Review authority: independent, read-only review of the V3.17 source-led release,
its Requirements carrier and the bounded candidate-sandbox repair. It grants no
production data write, runtime activation, deployment, password reset, credential
rotation, LINE, dispatch, automatic trading or Promotion authority.

Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `01aedbab4ab0035712439b86a327313c40d3e481`
- Requirements implementation commit: `5871350e93a4f9e77f9f06d91e4117ad6e87f1cd`
- Requirements evidence carrier: `de9c55eccd3fd6772a482c63915bb5da5dfe169c`
- Candidate-probe repair commit: `fe26986a2c46d3b3a26f7815e3ce7db52cce4925`
- Final repair-closure commit/tree: `fe26986a2c46d3b3a26f7815e3ce7db52cce4925` / `945870e2247903cef5b6b3c6f8a72bce1eb38a5b`
- Full reviewed implementation range: `01aedbab4ab0035712439b86a327313c40d3e481..fe26986a2c46d3b3a26f7815e3ce7db52cce4925`
- Active graph: `45230c430dedfab8794c1f0aaaa010b28ba06bcd40f67965ae5dbc9843fedc5d`

## Architecture closure

V3.17 separates source-led research visibility, per-stock research readiness and
formal action authority. The Decision Envelope remains the only authority for
`buy` or `accumulate`; `ResearchNextStep` and `ResearchSnapshot` preserve a
read-only, revision-bound explanation for waiting and data-needed cards. Global
integrity/runtime/manifest/migration/frozen-lineage failure disables actions but
does not erase checksum-valid research. Per-stock financial, valuation, technical,
peer and liquidity gaps stay in that stock's gate waterfall.

The DAG is frozen acquisition → deterministic persisted-plus-current union →
facts/valuation/technical/liquidity → decision → compact projection. It preserves
point-in-time `fetchedAt`, immutable retries and conflict quarantine. Only an
authorized document revision, entity link and candidate event nominate a stock;
official data only enriches the bounded source-led pool. InvestAnchors paid text
and Telegram content remain excluded from acquisition, model input and public UI.

The CSS repair uses semantic variants and active theme tokens so links/buttons have
measurable contrast in both themes. Detail uses the exact landing revision and
renders a validated research snapshot when no formal decision brief exists.

The host repair keeps the protected worker's two non-secret private handles as the
preferred candidate probe roots. Codex sandbox may strip arbitrary non-profile
environment values; only then may a candidate use its already-provided `TMPDIR`,
after the same absolute-directory, UID, no-symlink and no-group/world-access
checks. It never inherits `HOME`; partial, equal or unsafe handles fail closed.
The sandbox profile still controls filesystem and network authority.

Local product/runtime diagnostics, credentialless model-runner 17/17 and disabled
doctor PASS. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`; this review makes no
future-return, minimum-buy-card or Promotion claim.

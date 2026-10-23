# Taiwan strategy lab — implementation plan

Baseline: `169aad1b6cfa747f78ae3464b614f43c0749d806`. Scope and acceptance are frozen in `spec.md`; this plan grants no production authority.

## Components and dependency order

| File or directory | Responsibility |
|---|---|
| `research/tw-strategy-lab/preregistration.json` | Seven hypotheses, five executable trials, exact survivor panel, dates, folds, costs, execution and selection assumptions |
| `official_data.py` | Bounded public official-data acquisition into local research files; provenance/coverage manifest and typed failures |
| `strategies.py` | Deterministic S1/S2/S3/S4/S6 signals; S5/S7 explicit event-data blocks |
| `engine.py` | Offline cash, positions, delayed orders, conservative daily-bar execution, fees/tax/slippage, ledger and metrics |
| `run_research.py` | Validate registry/manifests, enforce holdout lock, run the finite chronological study and preserve all attempts |
| `report_events.py` | Point-in-time event evidence interface; unavailable revenue/broker history remains blocked |
| `article_builder.py` | Offline per-candidate preview_ready/blocked drafts and exactly-once dry-run publication queue |
| `results/` | Unique immutable run artifacts, manifests, complete trial ledger and reports |
| `README.md` and OpenSpec `tasks.md` | Resumable checkpoint with exact commands, input/result identities, completed work and remaining blockers |

All paths in the table except OpenSpec tasks are relative to `research/tw-strategy-lab/`. Any implemented command/schema must be documented in the README before automation uses it; this plan does not invent an executable CLI that has not been built.

1. Freeze the registry before observing development results. Validate seven hypotheses, five price configurations and three fixed execution scenarios (15 development runs), and forbid signal-parameter sweeps. Identify the initial eight symbols as survivors.
2. Acquire only the 2018–2023 official price development material. Keep response hashes and coverage separately from execution qualification. Reuse cached verified bytes deterministically; bounded failures remain visible.
3. Implement and test the portfolio engine independently of signal profitability. Cover the frozen fill assumptions, cash conservation, costs and time boundaries before running the research study.
4. Implement the five price strategies and the two event-data blocked records. S1/S2 may take design guidance from `web/src/lib/tw-entry-plan.ts`, but a Python port must not claim parity without tests against its formulas and state meanings. Do not edit or call a production producer to make the lab run.
5. Execute the 15 registered continuous development runs and their descriptive half-year windows, retaining all attempted trials and exclusions. There is no fitting, performance-based selection, independent-fold or OOS claim in this round. Use existing `opportunity-v3/outcomes.ts` and `evaluation.ts` only as references for compatible result metrics; ranking precision is distinct from net portfolio performance. Leave the holdout closed.
6. Build drafts only from the supplied candidate snapshot and actual research/evidence records. Every row is accounted for; missing full-roster export blocks a full-App coverage claim. Write a dry-run queue, never a publication request.
7. Complete focused tests and independent review, then the repository-required production web build. Store actual test counts/failures and source identities. Recheck failures after a relevant fix; do not weaken expected behavior or fabricate a gate attestation.

## Audit and continuation

Every results run is a new identity bound to the source commit, canonical registry and data hashes. Persist a started/failed/blocked/completed terminal record even when data or a strategy fails. Costs, benchmark and fold rules are part of the run identity. A later rerun cannot silently replace the original study or become an unregistered sixth price trial.

The hourly continuation reads the README and OpenSpec checkpoint first. It should select a bounded pending task, preserve completed artifacts, record what actually ran and stop by `2026-09-25T18:48:00+08:00`. It must not use idle elapsed time to claim more research or turn a repeated infrastructure failure into invented data. Apply the existing Loop iteration/repeated-failure rules to dependent work while continuing independently useful authorized tasks.

## Production boundary

The lab has no production database or broker client. Public source downloads are distinct from application data writes. A later integration proposal may use research findings only through a reviewed new strategy/model version with its own evidence and preserved per-stock qualification. `preview_ready` drafts stay offline until a separate guarded publication flow has genuine full-candidate input and review evidence. See `deployment-handoff.md` for the final operational sequence; nothing in this plan triggers it.

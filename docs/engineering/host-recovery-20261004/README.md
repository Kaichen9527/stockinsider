# October 4 host recovery candidate

The candidate pins native `codex-cli 0.160.0`, SHA-256
`6b582e8813ce7e8ed4c52814ee5cf230dba647bf2292df747a4003f2657ef201`, with measured
native/application signatures and all exact filesystem identities. Fixture v3.22
has 2,202 bytes including LF; the operation-bound successor runner identity has
890 canonical bytes and a new runtime state namespace. The active catalog and package-script mirrors have
been reconciled. September observations and review claims remain historical.

Local validation completed:

- Actual signed host preflight and Apple notarization assessment passed.
- Noncredential runner suite: 21 passed, zero failures/skips/todos. Its two live
  protected oracles are deliberately not registered in this mode.
- Actual generated runner policy canary: 9 passed, including private transport,
  outside cache, descendant access and network denial, with positive controls.
- Recovery packet and existing protected-worker suites: 31 passed together
  (15 recovery protocol tests and 16 protected-worker regressions).
- Web production build and `git diff --check` passed.

These results are local evidence, not independent approvals or protected Code
Gate success. `observation.json` and `canary.json` contain the measured evidence;
neither accessed account credentials or invoked a model. The original canary is
retained; `routing-canary.json` checks the successor adapter's actual generated
policy. The exact Sol 6.1 make/Astra review+verify split and new live-oracle
obligations are in [routing-amendment.md](routing-amendment.md). The protected live
oracle has not run and remains blocked on external recovery authority.

The inactive recovery validator and read-only facts generator prepare a concrete
review boundary. The final source facts must be generated after committing,
outside this tree. No external owner key, signed review packet, durable ledger,
installer or base registration exists here. The current protected base still
rejects this candidate. The precise remaining authority and integration steps
are in [recovery-amendment.md](recovery-amendment.md).

No workflow, ruleset, successor approval map, review-source map, production
database, release or deployment was changed. The existing base-owned candidate
sandbox also requires an independently reviewed recovery change; the runner
policy canary does not establish that base worker's launch/permission correctness.

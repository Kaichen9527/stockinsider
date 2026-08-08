# Requirements Round 85 P1 Repair

Repair date: `2026-07-30`

## Immutable repair boundary

- Reviewed Requirements subject: `6cf22c1de2ca3ab74252e9cc92df2c72dec4e5cf`
- Repaired implementation tree: `be7c58009ba6d8ed36b0ea8a117ebedca10613a3`
- Exact range: `6cf22c1de2ca3ab74252e9cc92df2c72dec4e5cf..be7c58009ba6d8ed36b0ea8a117ebedca10613a3`
- Range scope: 16 paths, 407 additions and 268 deletions; no migration, deployment,
  runtime installation, scheduler, flag, database, push or production mutation.
- `git diff --check` over the exact range: PASS.

This repair is a Requirements/acceptance-authority repair only. It does not claim a
Code Gate, Architecture, runtime, evaluation-governance or Verification PASS.

## P1 closure work

### PCR executable authority and baseline isolation

`product-correctness-runtime.ts` replaces the generic success façade with a closed,
ordered 31-ID case registry. An implemented result can arise only from that case's
registered executor and carries the case ID, fixture hash, implementation source path,
test-owned runtime surface and nonempty product-observed payload. The test independently
asserts all of those fields and rejects the prior `setupVerified`/`expectedVerified`
self-attestation shape. The current empty registry returns the exact fixture-bound
pending disposition, so ordinary mode remains 31 real per-case RED failures until Terra
implements the runtime surfaces.

Requirements-only baseline mode now requires all of:

- `OPPORTUNITY_V3_PCR_PREIMPLEMENTATION_BASELINE=round85-requirements-only`;
- `OPPORTUNITY_V3_ACCEPTANCE_TRACK=requirements_baseline`;
- `OPPORTUNITY_V3_ACCEPTANCE_OWNER_CHILD=true`; and
- one exact `OPPORTUNITY_V3_ACCEPTANCE_CASE`.

Each owner child may emit exactly one marker for its own case. The parent rejects absent,
duplicate or noncanonical markers. The ordinary package command clears the baseline and
owner-selector variables before starting Node; the product CI aggregate now includes the
ordinary command, so baseline evidence cannot satisfy Code Gate execution.

### GOV-004 named-tree execution boundary

GOV-004 now requires `HEAD^{tree}` to equal the named reviewed tree and rejects every
tracked, staged or untracked status entry before consuming any static import, migration,
package manifest, workflow, model-runner source or operator artifact. It retains the
45 active tree/index/working-byte comparisons, frozen graph comparison and all 181
catalog/row mutation checks. This makes a clean detached reviewed root the execution
authority rather than allowing non-active dirty worktree bytes to influence the oracle.

### Node 22 command authority

The product and evaluation owner literals now include `--experimental-strip-types`.
The same evaluation command is fixed in `package.json`; the product aggregate invokes
the ordinary PCR command. `scriptValueRows` now records all 13 Code Gate package values,
including the product-runtime aggregate.

The active acceptance authority advances to `opportunity-acceptance-evidence-v3.11.7`
and inventory `1.44.1`; product-correctness amendment advances to v3.11.4. The static
comparison tuple retains 41 members and 2,729 canonical bytes, with its acceptance
literal update producing digest
`508e677459ce0212cb51253f51cc8df132876fd2a4d4ba4251ee303497d7623e`.

## Recomputed identities

| Identity | Recomputed value |
|---|---|
| Acceptance inventory | `1.44.1/297` with exact JSON/Markdown order parity |
| Owner rows | 297, SHA-256 `0c673f082dd302446a73c9aeae4f1e46ddefb253d164152c7e4744454a352ff6` |
| Script rows | 13, SHA-256 `af78e12050431628c527887322c3fc5e680e81d40ec02058157204f6e9154686` |
| Product owner command rows | 129, exact strip-types literal |
| Evaluation owner command rows | 20, exact strip-types literal |
| Active catalog | 4,133 bytes, SHA-256 `c2886bf43a6675a476e6dbba7c406fc5e23aca388d588eb5dd8d5c194ee1a7b6` |
| Active graph | 45 files / 37 owners, 6,710 canonical bytes, SHA-256 `bf2345315150fbf09ba8abee48fbba837b11cd6e486c203f30a359e60ebfc596` |
| Static comparison tuple | 41 members, 2,729 canonical bytes, SHA-256 `508e677459ce0212cb51253f51cc8df132876fd2a4d4ba4251ee303497d7623e` |

## Focused verification

- `node --check` of traceability and Node strip-mode parse of the TypeScript PCR runtime:
  PASS.
- Exact baseline child `PCR-001`: one exact pending marker and PASS.
- Clean detached tree parent baseline oracle: all 31 owner children PASS, each with one
  exact fixture-bound pending marker.
- Ordinary package command: intentionally nonzero with 31 tests, 0 pass, 31 per-case
  RED failures, 0 skip and 0 todo; this is not a Code Gate PASS.
- Ambient baseline variables without owner-child authority: rejected with
  `PCR baseline mode is reserved for a traceability owner child`.
- Clean detached tree GOV-004: PASS with the frozen catalog/graph identities above.
- After adding an untracked non-active authority file in a disposable root, GOV-004:
  nonzero and `execution root must not contain tracked or untracked authority drift`.
- Exact strip-types product/evaluation traceability command forms load and execute their
  selected GOV-004/EVAL-001 owners in the clean detached root.

An attempted local TypeScript Code Gate command remains blocked before project checking by
the existing dependency environment's missing `estree 3`, `json-schema 3`, `json5 3`,
`node 3`, `phoenix 3`, `react 3`, `react-dom 3` and `ws 3` type definitions. No
dependency or lockfile mutation was made to conceal that environmental issue; full Code
Gate is intentionally downstream of Architecture and implementation.

## Next gate

Run independent fresh Requirements Round 86 against exactly repaired tree
`be7c58009ba6d8ed36b0ea8a117ebedca10613a3`. Architecture Round 10 remains locked
unless that review returns `P0=0` and `P1=0`.

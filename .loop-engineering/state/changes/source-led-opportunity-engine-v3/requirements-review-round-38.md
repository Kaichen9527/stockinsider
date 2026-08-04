# Requirements Gate Round 38

## Formal verdict

**CHANGES_REQUIRED**

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 1 |
| P2 | 0 |

Architecture Gate remains locked because policy permits no P0 or P1 finding.

## Immutable review evidence

- Baseline B: `12c131aa50ca53268878e9f025973533ac100c49`.
- Direct parent P: `9eaff2fa9c0978a85ff5d64110edc36945e96ee0`.
- Review H: `95274092134385a33e1e29e126e2605abc1d523d`.
- H root tree: `c7b85297a1c465f556301a4a769d1177b6b6df8c`.
- H change subtree: `31cfc4edd0610c6a68874ff0e33d60b5ef4d8049`.
- Reviewer session: `019f7b1f-4f86-7fe0-a7aa-baaa799259aa`, fresh `gpt-5.6-sol` at xhigh reasoning, read-only, approval never, ephemeral, user config/rules, web, apps, plugins, hooks, MCP, multi-agent, browser/computer use, shell snapshot, skill dependency installation and tool suggestions disabled.
- The reviewer verified H as a commit with exactly parent P and read the immutable H corpus from the isolated object database. It did not edit the worktree or perform an Architecture Gate.

## P1 finding

### REQ38-001 — Active internal-principal authority version is inconsistent

`auth-principal-contract.md` declares `internal-principal-v3.8`, the runtime static identity binds `internalPrincipalContractVersion` to v3.8, and the design root makes v3.8 the active owner. Four active normative delegations still cite `auth-principal-contract.md v3.7`:

- `requirements.md:210`;
- `authority-supersession-contract.md:19`;
- `source-adapter-contract.md:11`;
- `market-contract.md:60`.

These competing edges make the single-owner version graph and canonical `GOV-004` stale-reference oracle unsatisfiable. All four delegations must cite the already-active v3.8 owner, and a complete active-corpus scan must prove that no v3.7 edge remains.

## Independently closed Architecture Round 3 mechanisms

The reviewer found the four Architecture Round 3 repairs materially specified and cross-bound:

- sector evidence obeys `10*K + 2*U <= 10*R <= 200000`, handles `unknown` explicitly and reuses benchmark rows;
- entity-link evidence is immutable, sample-bound, blinded, bounded and excluded from public/error/log surfaces;
- exactly two private helpers remain, while job/page UUIDv5 is inline and reproduces the DNS, job and page vectors;
- rollout is the closed `disabled|drain|shadow` state machine with quiescence, deadline, emergency disable, retained additive schema, immutable legacy lock and fail-closed re-enable ordering.

## Mechanical evidence

| Check | Result |
|---|---|
| Active normative catalog | 32 artifacts; digest `79b26e2be683b05e296391430fbf804c60f2e0b70d39ea33e8e6e130db6842c5` |
| Acceptance | `1.31.0`; declared/actual/unique all 231 |
| JSON/Markdown parity | Exact five-field/order hash `c55f050aef13257ce0f13853db26774eb05bdefed417e29651d4818c008332d4` |
| Acceptance ID order | `4a3ec42e1a3927cab7b2d01a2a24f10b6a51a8d60c080f58a09be00a894e8b4f` |
| Missing/duplicate/extra/skip-todo equivalents | 0 / 0 / 0 / 0 |
| Round 3 repair cases | `SCR-014`, `EVAL-014`, `MIG-005`, `OPS-040` present |
| Taxonomy | 32 codes/32 non-unknown sectors; `6b28d85903d7a410eef29386de011c71aa789dc0ce3231df38cb4e085181060c` |
| Structural catalogs | 36 static members, 19 manifest kinds, 11 source adapters, 7 authority families, 31 public RPCs, 2 private helpers |
| Stale active principal edges | Exactly 4 |

## Final gate state

**CHANGES_REQUIRED — P0=0, P1=1, P2=0.** Architecture, implementation, App code, executable migration, merge, push, deployment, production mutation, scheduler enablement, homepage promotion and model influence remain unauthorized. After the four non-owning version edges are corrected, a brand-new Requirements Gate must review a new immutable head before Architecture review may start.

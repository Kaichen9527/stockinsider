# Current-native runner recovery — inactive implementation candidate

This is a separately reviewable source preparation from protected main
`169aad1b6cfa747f78ae3464b614f43c0749d806`. It is not an initial-establishment
approval, installed replacement, protected PASS, or production deployment. The
application2e tree and other worktrees were not changed. Independent review of
this candidate remains required; its maker does not approve it.

## Implemented boundary

- Reuse exact PR317/318 closed JSONL FSM and bounded process lifecycle, including
  caller `recovery_required`, retained reservation/budget and blocked replay when
  process-group ownership cannot establish safe cleanup. No dead-PID signalling.
- Reuse PR288 operation-bound Sol6.1 High maker / Astra High reviewer+verifier,
  manifest7, no legacy waiver/strategy override, and explicit private transport
  policy. Their combined latest source is taken from0825db4; no historical host
  fixture, approval registry, recovery key or planner authority is imported.
- A fresh **public measured** current-native fixture lives only at
  `host-pins.candidate.json`. Its `approvalAuthority` is null and status is
  inactive. `recoveryCandidate.js` reads only these fixed bounded, hash-bound
  bytes; it does not install or authorize anything. The original active v3.18
  fixture and its loader are preserved byte-for-byte.
- Distinct proposed runner identity
  `0945109f816596276ffaaae51fc6b365eb4301bdeae653fb8547e3bda4bb849f`
  (932 canonical bytes) and namespace `model-runner-v3-oct11-candidate` prevent
  claiming the old successor identity or resuming its state. Identity is a
  proposed protocol label; final source is additionally bound by Git commit/tree.
- Actual CLI run/review/verify and real-model-attempt entry points contain fixed
  inactive fences. There is no environment/argument activation override. Pure
  components and no-credential harnesses can be reviewed and tested independently.
- The protected worker's policy constructor is exported within the same
  base-owned module and used by its existing sandbox caller. Tests compare all
  four writableSource/network combinations byte-for-byte with main169's actual
  generator. Protected fixture selection, CLI path selection, review registry,
  successor map and workflow authority remain unchanged. No alternative authority
  ingress or candidate-selected runtime fixture was added to that worker.

The current CLI accepts the existing sandbox invocation and enforces the tested
policies. Therefore the first ENOENT does not require a new generic service or a
permission-policy relaxation: it requires a legitimately established fresh
trusted fixture/identity transition. This preparation does not perform that
transition. The base-owned worker will still select the old path until such a
separately reviewed transition is authorized and installed.

## Actual current-host evidence

`host-observation.json` contains streaming SHA256 with before/after identity
checks, exact versions and public codesign/spctl outputs, all launched with a
synthetic private HOME/CODEX_HOME. No credential value was read or copied.

- Native: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`
- Observed version: `codex-cli 0.162.0-alpha.17.2`
- Native SHA256: `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`
- Native strict and whole-App deep/strict codesign: exit0.
- Whole-App Gatekeeper: exit0, accepted, Notarized Developer ID.
- Node22.14.0 and Apple Git2.50.1 were freshly measured with their actual stat/hash.
- `host-validation.json` preserves a genuine RED: the Python parent ran x86_64
  and its universal Node child was x64; original arm64 host guard rejected it.
  This was independently confirmed with platform.machine/process.arch. Explicit
  `/usr/bin/arch -arm64 /usr/local/bin/node` then passed the original unchanged
  full host-preflight function against the candidate fixture, recorded in
  `host-validation-arm64.json`. No architecture assertion was weakened. Its
  noncredential mode omits spctl as before; full spctl is in the observation.

These are host-specific observations at their actual time, not durable permission
to use a changed binary. A later native/App/stat drift must fail closed.

## RED, GREEN and scope

- `base-parser-negative-red.tap`: actual main169 parser reproduced accepting a
  terminal JSONL transcript missing thread/turn start (one expected assertion
  failure). Source was extracted from immutable169 into memory for this probe.
- `parser-lifecycle.tap`:81/81,0fail/skip, including actual caller retained-resource
  retries and controlled non-provider child/pipe cases. Core helper bytes are
  exactly reused from0825.
- `protected-worker-unit.tap` and `worker-candidate-final.tap`: preserve two
  intermediate static-test failures when the constructor moved outside the
  expected worker source or changed its literal form. The existing test was not
  weakened: final constructor remains within the worker with exact legacy policy
  expressions and output. `worker-candidate-green.tap` records the first closure.
- `final-focused.tap`: **103/103,0fail/skip/cancel/todo** on final source. Includes
  the original16 protected-worker unit cases,81 parser/lifecycle cases, and6 new
  candidate/real-entrypoint/policy-byte-equivalence tests.
- `sandbox-frozen-source.json`: **14/14** real current-CLI no-credential cases
  using the exported actual worker policy and actual candidate runner adapter:
  source read; scratch write; source write denied; private sibling denied;
  synthetic private transport denied directly and through a descendant;
  loopback networking denied after a real reachable positive control. Both
  policies use network=false in this canary. Earlier14/14 receipts remain
  historical. The allowed-network npm dependency operation was not executed.
- `git diff --check` and Python AST parsing passed. No npm ci, full build,
  production database, protected workflow, model/auth call, or provider was run.

The synthetic transport file is explicitly not an account auth file. Temporary
canary roots and local test servers are owned and removed/closed. Test crypto
constants already present in reused source are fixtures, not newly enrolled keys.

Reproduce the lightweight checks:

```sh
/usr/local/bin/node --test \
  scripts/opportunity-v3/protected-external-gate-worker.test.mjs \
  scripts/opportunity-v3/runner-recovery-candidate.test.mjs \
  scripts/model-runner-v3/jsonl-parser.test.js \
  scripts/model-runner-v3/process-lifecycle.test.js
python3 scripts/opportunity-v3/runner-recovery-sandbox-canary.py --output /absolute/new/private/receipt.json
```

The latter deliberately requires this exact observed host fixture; output must
not exist. VM may run portable tests, but cannot claim Mac host checks passed.

## Exact contract amendment still required before activation

The frozen main acceptance inventory, model-runner-contract, active-artifact
catalog, package scripts, original model-runner-v3.test.js, doctor selector,
protected workflow, active host fixture and approval maps were **not amended**.
The original full19-case model suite expects legacy routing/manifest/identity and
live host authority; it was not run or presented as passed against the new
candidate. This source is deliberately not a full frozen-acceptance release.

An independently reviewed finite amendment must address, together:

1. Operation-bound Sol6.1/Astra routing, manifest/permission/runner identity and
   new state namespace; source-level parser FSM, separate stdout/stderr bounds,
   monotonic300s complete-line idle and terminal pipe/ownership-loss semantics.
   The lifecycle failure branch retains resources; it cannot be declared normal
   cleanup and retried. Prior317/318 evidence is reusable only by exact scope.
2. Exact current host fixture/version/signatures/stats and doctor/required-pin
   selector, MR3 pin/identity literals and the associated governed command mirrors.
   No stale authority string may be copied; measured compatibility is not approval.
3. Exact new listing/active graph and genuinely independent review references,
   source-bound host/live-oracle results when separately permitted, and the real
   initial-establishment landing decision. The old base has no consumer for a new
   owner packet and cannot approve its own replacement.
4. Removal of fixed inactive fences only in that explicitly authorized, reviewed
   successor. Recheck host facts immediately before the actual operation and
   retain uncertain/failed transition evidence. Do not alter required checks or
   forge a successful old track to land this candidate.

This is a concrete component/code/measurement slice for review, not another
installer planner. No general recovery service, new trust registry, durable CAS
implementation or ruleset exception is claimed. The independent initial-bootstrap
report explains the separate human governance decision. It does not block the
parent's separate deployment of already-approved main169.

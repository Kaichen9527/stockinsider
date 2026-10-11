# Unsigned scoped runner recovery review

Subject `892c93e2d4d44e863be9b6aed7407cf975e905b4`; tree `2df896d7ca54cfb8f58b362842b84f3419c49354`; base `169aad1b6cfa747f78ae3464b614f43c0749d806`. Reviewed all33 changed paths: inactive runner component changes, protected-worker policy extraction, tests and their evidence/provenance. Repository remained unchanged.

**Verdict: scoped CODE PASS for the inactive candidate. No new actionable P1/P2 found. This is not a frozen-acceptance release PASS, protected approval, host enrollment or activation authorization.** The branch deliberately does not yet provide an executable authorized recovery path; main169 deployment is separate.

## Native pin and authority
`recoveryCandidate.js:6–26` reads only one fixed candidate fixture, bounded2425bytes, NOFOLLOW/NONBLOCK, regular-file/stat stability, SHA and canonical duplicate-free JSON checks. `approvalAuthority:null` and inactive status are required. Raw file SHA a5bc7f4a0e7122c54fdbacdde9cef8e72c98e96584eba4d4faaea2f897f6d579 includes LF; runner identity's6dd3bba92ed656b0cd47ef96d0f4b08226bc0e8f9d25ed6b1b9939f50123440c is the same canonical bytes without LF, independently recomputed. These are consistent, not conflicting pins.

The measured executable is codex0.162.0-alpha.17.2 at the nested CodexCLI.app path with SHA0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28. Host-observation/signature/version records are historical maker evidence, not my fresh host measurement. The x64 RED and explicit arm64 host-preflight GREEN remain separate. No current credentials or native binary were opened/executed by this reviewer.

Original active host fixture/loader, frozen inventory/contract/catalog, package commands, protected workflow and original full model suite remain byte-identical to main169. Candidate loader is not substituted into the active protected worker. Worker fixture selection remains its base-owned path (`protected-external-gate-worker.mjs:737–743,810`); the policy constructor export does not select executables or enroll authority.

## Parser, execution and sandbox boundaries
The JSONL parser, lifecycle helper and their two test files exactly match previously reviewed0825db4. Adapter/routing/manifest also match0825; execution differs only in candidate identity and journalStore only in identity/state namespace. This is explicit reuse of exact source scope, not imported approval of new host facts.

The parser enforces closed event/usage/item shapes, thread UUID, thread/turn order, item lifecycle, unique final terminal, full terminal turn, fatal UTF8 roundtrip,16MiB/100000-line/1MiB-line limits and duplicate-key rejection. Default sealed results remain distinct from explicit diagnostic oracle mode. Caller sealing still checks request/source identity; parsing alone does not prove platform execution/model identity.

Lifecycle keeps separate16MiB stdout/8MiB stderr,300-second complete-line idle and monotonic deadlines, bounded exit/drain, owned live-process-group TERM/KILL and no dead-PID fallback. Lost ownership retains resources/reservation/original round, marks recovery_required and blocks replay. Actual-provider cleanup is not proven by controlled child tests.

`codexAdapter.js:14–37` denies the owned parent/transport and reopens only read-only view and writable scratch; env is closed to synthetic HOME/TMP/CODEX_HOME and fixedPATH/locales. Operation-bound model routing rejects role/model swaps. Protected sandbox extraction adds path/type validation but preserves original output bytes for allfour writableSource/network combinations; actual protected caller supplies its own fixed toolchain paths.

The committed frozen-source canary binds fixture/script/policy module hashes and records14/14 checks with real native sandbox and synthetic source/private transport plus loopback positive control. Hash bindings were independently verified; its execution was not repeated. This covers tested network=false policies and controlled file access, not allowed-network dependency installation, full DNS/UDP/private-network policy, authentication transport or a real model output. Synthetic private transport must not be called account authentication evidence.

## What can and cannot execute
`runner.js:129–132` rejects run/review/verify before verifyExecutionHost; `real-model-attempt.js:13–14` rejects before transport/auth/model work. Tests exercise these real fences. There is no argument/environment activation override. Validate/route/status are not model dispatch or approval. Direct exported component functions remain trusted programmatic building blocks, not a new authority API.

Even removing the two fences would not complete legitimate recovery: `runner.js:65–69` and real-model-attempt still use the original pinned active loader, protected worker/doctor still select old base authority, and full19-case model acceptance expects the old contract. A separately reviewed finite contract/identity/host-selector transition and actual authorized live-oracle evidence remain required. Original acceptance is not silently rewritten; no successful old gate is fabricated. The README accurately labels those missing steps and this branch's incompatible inactive status.

## Independent tests and evidence
Executed only:
`/Users/kaerchen/.nvm/versions/node/v22.23.3/bin/node --test scripts/opportunity-v3/protected-external-gate-worker.test.mjs scripts/opportunity-v3/runner-recovery-candidate.test.mjs scripts/model-runner-v3/jsonl-parser.test.js scripts/model-runner-v3/process-lifecycle.test.js`

Result:103 PASS,0 FAIL,0 SKIP,0 CANCEL,0 TODO;13.44seconds. These use synthetic manifests/keys, injected no-auth transports and controlled local Node children; no model/provider/auth/native-sandbox command or protected workflow was run. TAP SHA256 `cc87200ef0acd4598da8f06f0d896a140e2e6fff45410c579e8a2b0bc34b7165`.

Evidence-index entries: 27 candidate source files + 15 raw records,42files/577976bytes, all sizes and hashes independently matched exact Git blobs. Final canary14-record truth values and source hashes consistent. Historical parser RED, host-architecture RED and intermediate worker static-test failures remain retained. No npm install/full build/full19-case live-host suite ran here. Current binary drift, approved bootstrap transition, live model terminal compatibility and protected track success remain unproven.

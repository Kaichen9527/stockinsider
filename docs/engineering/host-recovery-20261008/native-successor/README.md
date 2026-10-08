# October 8 native successor — inactive review candidate

The user authorized a separately reviewed successor after the native identity
changed. This branch prepares it without replacing any binary, reading secrets,
creating authority keys/grants, reserving a predecessor, modifying protected
registration, merging or deploying. Independent exact-commit review is pending.
The old e94d21f subject and all old packets/facts are preserved.

## Measured identity and change scope

Actual `--version` output is `codex-cli 0.162.0-alpha.2`, not an inferred release.
The binary SHA-256 is
`cb4e4994627e770800a940b42969c77855a3fc09a6e60b02aa6319f670d6b6ab`.
`observation.json` contains exact native/app signatures and stat identities.
Node `/usr/local/bin/node` v22.14.0 and Apple Git 2.50.1 were remeasured and retain
their prior exact identities. No fallback path/version or mutable host discovery
is admitted by the runtime. Same-UID race limitations remain unchanged.

The proposed host fixture is v3.24, 2,210 LF-terminated bytes:

- Pre-LF SHA-256: `fc76b082ae4fbe9284f888d94ac459547cfb50bfa180ad864e27952fecfd5022`.
- File SHA-256: `a5d85c7d30fad640459615f164a58a4eef5d37ce4e57ae9d7e942b22dacc99d9`.
- Runner contract v3.9; identity is 898 canonical bytes with SHA-256
  `fdc18db72738748139bc457503b7541c5ba0daee306b1fda1525e038493d6a03`.
- New namespace `model-runner-v3-sol61-astra-v2`; previous namespaces stay ignored
  and are never resumed or rewritten by this successor.

Manifest v3.7 and routing v3.7 remain unchanged: Sol 6.1 High makes; Astra High
reviews/verifies. Adapter permission rules, strict JSONL parser, private transport
and source exclusions remain unchanged. Changing the native version does not
prove those protocols work in live model transport; unknown behavior still fails
closed. Product acceptance retains the same 320 cases and 41-member identity.
Only MR3-019 pin literals/length and the required-pin package command mirrors are
updated under this proposed host amendment. A new portable test compares the
entire acceptance object against exactly that finite transformation.

The predecessor remains protected main
`169aad1b6cfa747f78ae3464b614f43c0749d806`. Preparation parent is
`7a67f435e909e0472a2273a896cd9f309466efbf`; the historical native subject is
`e94d21f9fe05dc436211a2458ea59adb52195e26`. The final candidate commit/tree and
Git listing/active graph digests are generated outside the committed tree after
freezing, using the existing `host-recovery-proposal.mjs` source-facts generator.
No signed owner packet is generated.

## Actual Mac checks

Only lightweight host-specific verification was performed:

- Native codesign strict verification: exit 0.
- ChatGPT.app codesign deep/strict verification: exit 0.
- Gatekeeper: exit 0, accepted, Notarized Developer ID.
- All three executable versions, hashes, stat/realpath identities measured.
- Candidate `loadHostPins` plus actual `verifyCurrentNode`: true, including its
  full signature/Gatekeeper checks and before/after host identity checks.
- Actual generated candidate permission policy canary: 9/9 passed, including
  positive controls, source read/scratch write, private sibling/transport/cache
  and descendant denials, and network denial. Receipt is `policy-canary.json`,
  SHA-256 `20b63852c60b14f488bf40d3c74360aef2696e1e9a3aceb9e923073eb30d1418`.
- New portable test file syntax and `git diff --check` passed.

No model was invoked, no real credentials loaded, no protected live oracle run.
Synthetic canary paths/content are public test artifacts only. The observation
and canary are unsigned implementation evidence, not independent reviews.

## VM handoff and remaining exact review

Full regression and production build were deliberately not run on the Mac.
Run portable tests from the frozen candidate on the VM (Node 22), with immutable
predecessor, e94d and 73e0aed Git objects available:

```sh
node --test scripts/opportunity-v3/native-successor-contract.test.mjs \
  scripts/opportunity-v3/host-recovery-packet.test.mjs \
  scripts/opportunity-v3/host-recovery-install-plan.test.mjs \
  scripts/opportunity-v3/protected-external-gate-worker.test.mjs \
  scripts/opportunity-v3/acceptance-traceability.test.mjs
npm --prefix web run build
```

The complete `model-runner-v3.test.js` suite contains actual macOS host/doctor
probes. A Linux VM cannot truthfully pass those probes. VM testing may run its
portable cases with a clearly reported host-case exclusion; that is not a
complete Mac/live-oracle result. Do not replace the platform expectations or
convert missing host proof into PASS. Preserve existing routing/manifest/journal
adversarial coverage and report every exclusion and any failure separately.

The frozen October 5 installer planner still binds e94d and MUST reject this
successor's source facts. It was intentionally not generalized or changed to
accept arbitrary subjects. A successor installation plan requires its own
independently reviewed exact-source adaptation after this candidate is frozen;
old plan signatures cannot be reused. The new portable contract tests assert
that the old packet verifier/planner and protected worker/workflow bytes remain
unchanged and reject altered facts.

The external operator still must supply an authenticated existing host-recovery
entry point, established owner/reviewer public-key registry, installation and
recovered-base publication permission, exact reviewed worker/registry bundles,
and durable predecessor CAS with permanent failure retention. Genuine owner and
three independent signed review envelopes must bind the new final subject, plan,
reports and current measured host. No runtime HMAC source-worker activation grant
may substitute for that authority. If no entry point exists, its separately
approved bootstrap contract is missing; candidate source cannot create it.

Only after lawful recovery may fresh five-input protected checks and both live
oracles establish release authority. The root can continue VM product/PG/
PostgREST work without treating this inactive successor as installed or approved.

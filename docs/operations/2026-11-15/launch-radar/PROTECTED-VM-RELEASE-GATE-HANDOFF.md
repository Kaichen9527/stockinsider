# Protected release gate handoff for Codex VM

Observed on 2026-11-15 Taipei. PR #384 still has subject `cbb581662e72942610ff85b0bf5e7e47ddddfa46`, and protected base is `93e44475cbb0c27beb26e4dcb68e382096a4e212`.

The required context from the active GitHub ruleset is `stockinsider-v3-gate-root`. The Requirements, Architecture, and Exact Review job logs all stop while fetching the same absent subject-specific evidence branch. An independent direct ref lookup returned HTTP 404. The model-runner job was skipped. The repository lists exactly one registered runner, an online self-hosted macOS ARM64 host, and zero registered Linux self-hosted runners. The observed macOS runner is associated with the local Mac inventory and has not been dispatched.

- [Rules applied to main](https://github.com/Kaichen9527/stockinsider/rules/20177392)
- [Required gate run](https://github.com/Kaichen9527/stockinsider/actions/runs/39996616648)
- [Architecture log](https://github.com/Kaichen9527/stockinsider/actions/runs/39996616648/job/120561768034)
- [Requirements log](https://github.com/Kaichen9527/stockinsider/actions/runs/39996616648/job/120561768044)
- [Exact Review log](https://github.com/Kaichen9527/stockinsider/actions/runs/39996616648/job/120561768148)

## Work required to admit a VM runner

1. Preserve the main-owned bootstrap, ruleset integration, immutable artifacts, independent exact-subject signed review, and requirement for all five gate inputs. Keep the model track dependent on Exact Review and within the authorized dispatch boundary. Preserve old envelopes and the existing Mac profile for historical runs.
2. Review a successor runner profile in its own base-owned change. The current workflow uses macOS ARM64 labels. The worker independently checks Darwin, xcode-select, and xcrun and allocates a Mac-specific Codex sandbox policy. Model host preflight fixes Darwin/ARM64, Apple signatures, physical executable paths/runtimes, bundle identity, and explicitly scoped subprocess behavior. An authoritative VM profile must admit named, pinned VM execution and reproduce or replace these checks with independently verifiable platform, binary provenance, digest, owner/mode/ancestry, version, and toolchain checks.
3. Keep candidate execution in a detached subject workspace with a minimal no-credential environment and kernel-observed read/write/network boundaries. Prove read-only boundaries, deny outbound access for offline candidate work, and isolate or omit general secrets from candidate execution. Compare the complete code listing before separate credentialed base-owned model probes. Bind model/effort, request/response evidence, command identity and process cleanup to the same registered base, scope and exact subject. Preserve checks against a forged or stale receipt, substituted runner or executable, and subject-side changes to harness inputs.
4. Independently review the successor contract, demonstrate its positive and negative controls on the actual approved VM, and follow the protected maintenance process to activate it before relying on it for PR #384. Obtain independent evidence for the final promoted PR head and run every required job with the registered authority. Keep product and release validation requirements.

[Protected workflow](https://github.com/Kaichen9527/stockinsider/blob/93e44475cbb0c27beb26e4dcb68e382096a4e212/.github/workflows/source-led-opportunity-external-gate.yml#L158) · [Worker toolchain boundary](https://github.com/Kaichen9527/stockinsider/blob/93e44475cbb0c27beb26e4dcb68e382096a4e212/scripts/opportunity-v3/protected-external-gate-worker.mjs#L780) · [Model host identity](https://github.com/Kaichen9527/stockinsider/blob/93e44475cbb0c27beb26e4dcb68e382096a4e212/scripts/model-runner-v3/hostPreflight.js#L237) · [Protected harness contract](https://github.com/Kaichen9527/stockinsider/blob/93e44475cbb0c27beb26e4dcb68e382096a4e212/.loop-engineering/state/changes/source-led-opportunity-engine-v3/external-gate-harness-contract.md)

This is an implementation handoff and current-state receipt. The ruleset, workflow, review refs, registered runner, PR head, HOLD, and production were left as observed.

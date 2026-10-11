# Protected CLI transition: review preparation only

This slice descends from the inactive runner candidate
`892c93e2d4d44e863be9b6aed7407cf975e905b4`, whose parent is protected main
`169aad1b6cfa747f78ae3464b614f43c0749d806`. It adds only review documents and
Linux evidence. It does not establish trust, authorize execution, or activate the
candidate. The existing candidate's application tree, runtime, tests, active
host fixture, frozen acceptance expectations, registry and workflow are unchanged.

## What must change, and what must stay

The old executable is selected by `protectedHostPinFixture()` in the protected
worker. That function reads the **protected base tree**, not the candidate's
measurement document. `candidateSandbox()` then passes `codex.path` to the existing
`sandbox --profile external-gate-candidate --permission-profile
external-gate-candidate -C <subject> -- <command>` invocation. The pre-model
dependency phase uses this same selection. Replacing the model adapter alone
therefore cannot repair its old-path ENOENT.

The measured replacement is inside the already permitted
`/Applications/ChatGPT.app` read subtree. The path change needs **no worker spawn
logic or sandbox permission expansion**. It needs an explicitly established new
trusted host identity in the base used by that worker. A caller-supplied path,
candidate fixture fallback, environment override or existence-based fallback would
cross that boundary and is deliberately absent.

`host-identity.reference.diff` is the exact readable difference between the old
main169 active fixture and the existing candidate's measured fixture. Its two
headers are reference-only names; it is **not an installation patch**. All 18
changed fields, source paths, whole-file and canonical hashes are recorded in
`host-identity-changes.json`. This avoids presenting a path-only patch that cannot
pass the retained version, bytes, hash, stat, signature and architecture checks.
The measurement's `approvalAuthority` remains null. It cannot inherit the old
v3.18 approval string. The measured codesign requirement text includes its original
`Executable=` output suffix; retain that observation and independently establish
the final canonical trusted representation rather than silently normalizing it.

The active loader still requires v3.18, 2144 bytes and canonical SHA256
`4e3a508b5120903ec7364771ba1aea8b98bd43e1d58f0ed1fcee1faaf8457008`.
It deliberately rejects the 2425-byte inactive measurement. The protected graph
map and package doctor selector still reference v3.18. The candidate's fixed
run/review/verify and live-oracle fences remain present, without an override.

## Exact remaining acceptance

| Item | Current evidence | Still required before an executable transition |
| --- | --- | --- |
| CLI, App, Node and Git identity | Existing 892 public Mac measurements; new CLI SHA256 `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28` | Fresh target-host before/after hashes, realpaths, stat, arm64, strict signatures and Gatekeeper checks; drift must reject |
| Closed sandbox | Existing maker Mac canary 14/14; this VM tested all four policy constructions byte-for-byte | Independently attributed target-Mac native results; dependency/network-enabled operation and full closed model track remain untested here |
| Parser and lifecycle | This VM ran the original four-file candidate selection, 103/103 with actual controlled Linux child processes | This is not the legacy full model-runner suite, live oracle or protected workflow |
| Host fixture consumer | Old active bytes and loader unchanged | Reviewed final canonical trusted fixture, version/length/hash, doctor selector and required-host-pin mirrors together; no approval fabricated from measurements |
| Runner acceptance | Candidate manifest7, operation-specific routes, proposed identity and state namespace exist behind fixed inactive fences | Finite reviewed amendments to the frozen contract, original model-runner tests/inventory/catalog and governed command mirrors; do not change expectations merely to accept this candidate |
| Protected authority | Original graph/registry/workflow/maps unchanged | Genuine exact-subject independent review references and a human first-establishment decision for the new base; an old nonexistent native path is not an acceptance mechanism |
| Execution activation | Candidate run/review/verify and real attempt reject before provider/auth transport | Remove fixed fences only in the specifically authorized, reviewed successor after trust and acceptance prerequisites are met; live/provider execution requires its own authorization |

No replacement recovery key, generic planner or alternative owner packet is
introduced. No ruleset, runner trust baseline, required check, strategy parameter,
application API, SQL or production data is changed. Prior signed/unsigned review
receipts retain their original exact subjects and cannot approve this slice.

## Human operation scope for a later decision

The concrete decision is whether to establish a **new, separately reviewed host
and runner identity** for the measured current Mac CLI, not whether to bypass the
old failed check. If approved later, the implementation scope is: remeasure the
actual host; freeze its canonical identity and finite contract amendments; obtain
the exact review bindings; land the approved base transition through the available
authorized publication process; then validate that new base before enabling the
candidate entrypoints. It does not include changing required checks/rulesets,
copying credentials, deploying application changes, SQL writes or enabling a paid
provider. This document requests no immediate activation.

## Linux validation and limits

Raw evidence is in the accompanying ISO-prefixed `.agent/reports` directory.
The first restricted tool invocation returned 1/4 file-level results and three
failures. Direct diagnostics exposed EPERM for controlled Git child processes and
three lifecycle assertion failures under that environment. The same four-file
command, after the tool's automatic approval of native process execution, returned
**103 passed, 0 failed, 0 skipped**. Source and test bytes were identical. Both
attempts and diagnostics are preserved; the first RED is not relabelled as passed.

This Linux machine has no target `/Applications/ChatGPT.app` binary or Apple
codesign/developer toolchain. Its platform-supplied Linux Codex is a different
identity and was not substituted into the pinned Mac canary. The known missing Mac
path was not spawned again. No model, credential transport, provider or local
network canary was executed. Existing root Mac 14/14 observations are attributed
to the candidate maker, not this VM or an independent reviewer.

This slice adds no code, so it does not create a new application build. The
application tree is identical to main169. It makes no claim that a previously
built application validates the changed inactive runner. PR metadata was not
queried again after the existing authenticated CLI/API capability was known to be
unavailable; the exact remote candidate ref and local worktree/process inventory
were checked to avoid editing another worker's tree. Root retains PR/review work.

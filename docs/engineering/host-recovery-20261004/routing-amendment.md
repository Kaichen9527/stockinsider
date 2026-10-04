# October 4 operation-bound model routing amendment

Status: unactivated candidate; independent review and protected live tests pending.
Predecessor preparation commit: `01c48bd8b23734a9e89c6e0e3d987ee2d4311d56`.
That frozen commit and its unsigned facts remain historical and cannot authorize
this successor. The protected predecessor remains `169aad1b6cfa747f78ae3464b614f43c0749d806`.

The user's approved division is implementation by GPT-6.1 Sol High and independent
review by GPT-6 Astra High. The runner therefore admits exactly:

| Operation | Model | Effort |
| --- | --- | --- |
| make, including repair | gpt-6.1-sol | high |
| review | gpt-6-astra | high |
| verify | gpt-6-astra | high |

The sole strategy is `sol61-make-astra-review`. Contract v3.8, canonical manifest
v3.7 and routing v3.7 reject Astra-only and every older strategy/manifest. CLI
model, effort and waiver overrides fail. Direct adapter/execution entry validates
the operation/role/model/effort/strategy relationship and null waiver before any
host probe or process spawn. The serialized prompt is frozen before async probes.
Merely allowing two model names would not enforce this separation.

The new runner identity has 890 canonical bytes and SHA-256
`a2bf72cabbab4afd3749c3b2c7dede71f97ce2182d2ea674d0f62e140c456c4f`.
Its namespace is `model-runner-v3-sol61-astra-v1`; prior ready/reviewed/sealed states
are neither resumed nor rewritten. Native 0.160.0 fixture v3.22, filesystem stat
pins, signatures and permission policy behavior remain unchanged. The adapter's
source digest changes because it now enforces operation-bound model selection.

The two protected live test registrations remain required. Within the model
attempt test, the worker must now complete make, review and verify sequentially,
using three isolated source/scratch/transport roots and exact operation-tagged
terminal responses. Its output is `model-runner-real-attempt-v2` with completed
route rows; any failed/missing/wrong route prevents success. Model attempts are
bounded to 90 seconds each and the whole worker to 360 seconds. The real live
oracle is **not executed during candidate preparation**: the protected base lacks
the approved successor and external recovery authority. No synthetic test or
desktop agent conversation stands in for it.

The adversarial noncredential tests cover cross-operation swaps, legacy models,
historical strategies/manifests, wrong/missing roles, non-high effort, model/route
mismatch, missing/non-null waiver, forbidden CLI flags and preceding runner
identity. They also exercise the actual route-to-adapter arguments. Existing
private-source/transport/network permissions remain fail-closed.

After this source is frozen, generate fresh unsigned facts outside the checkout
using `host-recovery-proposal.mjs`, with the unchanged protected predecessor and
the new final candidate commit. The new commit/tree/listing/active graph/policy
digest must receive independent review and external owner signature. The old
facts at `recovery-final-facts.json` are ineligible for the new tree.

The external trust roots, authentic independent review sources, durable atomic
predecessor reservation, reviewed base-owned worker launch/policy repair and
fresh five-input protected gate remain real prerequisites. This amendment adds
no trusted entry point, approval registration, bypass actor, status check, merge,
deployment or credential-bearing execution.

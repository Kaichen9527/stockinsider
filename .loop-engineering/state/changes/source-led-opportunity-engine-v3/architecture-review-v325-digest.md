# Architecture review — V3.25 initial runner trust migration

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

- Final reviewed implementation commit/tree: `91c4c815619d2beda4336445a0ed6aae82ee4d04` / `71395de5a0efb67ea1da50148bf3d23665a11077`

- Full reviewed implementation range: `169aad1b6cfa747f78ae3464b614f43c0749d806..91c4c815619d2beda4336445a0ed6aae82ee4d04`

- Active graph: `c8576f1b60613ab0b424c9a6315ee64dee9c3d14d81c49dae10834bd66bc7e0a`

## Assessment

Authority remains protected-base owned. The closed new listing maps to the v3.25 fixture but is not presented as an approved successor of old main. The separately authorized initial tool transition is required before this implementation can act as protected base. Candidate code cannot nominate its executable or substitute review authority.

The pin loader checks exact length and canonical digest, no-follow/nonblocking access and stable descriptor/path identities. Executable validation remains bounded and exact. The actual Node process architecture is authoritative; a Rosetta shell's uname result is not substituted for it. Credential location derives from the operating-system account, not mutable HOME.

Existing sandbox restrictions, operation-specific resources, strict terminal parsing and normal lifecycle ownership rules remain in force. Diagnostic oracle output is distinct from a sealed proposal result.

The fixed private oracle refusal ledger is a local safety barrier, not a principal registry. Exclusive creation and fsync precede transport. Existing or uncertain records refuse execution. Process risk is marked before executeModel, including its permission probe. Unknown probe rejection cannot notify quiescence. Branded ownership loss also retains resources. Confirmed process completion permits quiescence notification before terminal parsing. Cleanup failure retains the barrier; no automatic reclaim or reset was added.

The final worker prepares fixed home/tmp siblings with exclusive mkdir and owner, permission, directory and canonical-path checks. The host helper independently validates the three directories and returns only the closed non-secret environment. HOME/CODEX_HOME and TMPDIR are separate siblings. It neither adopts existing children nor creates them implicitly. Candidate-side environment behavior, credential source, warning grammar, fixture and oracle refusal logic are unchanged.

Expired reuse short-circuits before historical-object access. Fresh execution still requires listing authority; expiry never supplies affirmative trust.

## Independent verification

The reviewed scope combines the earlier exact inactive component review, installation review and bounded repair reviews. f30 findings remain preserved. The invalidated 0ae opinion is not usable evidence.

At f6 the reviewer independently ran eight exact-blob recovery tests and five control-flow probes covering unknown probe rejection, branded loss, confirmed process failure, parser failure after completion and success. At 91c seven additional actual filesystem/environment checks passed. Tests used synthetic resources; no actual account ledger, credential or provider was accessed.

The reviewer independently recomputed graph c8576f1b60613ab0b424c9a6315ee64dee9c3d14d81c49dae10834bd66bc7e0a and listing 080db93a9b98e75b4b2bcb14e4097e25cb745f449d2c6c3c0b022dc204afd027. Same-listing authority resolves to protected_base; old main-to-new listing remains rejected. Application Web and migration paths are unchanged.

Root's prior live attempt remains failed. A separate review of process metadata supported manual quiescence confirmation and narrowly scoped cleanup of that specific attempt. That operational conclusion does not identify its exact inner failure location, prove model execution, or add a general recovery mechanism.

## Remaining integration and limits

This unsigned architecture/code opinion is not protected approval, genuine model execution or application deployment approval. Final host/model validation remains required through the existing trusted entrypoints.

Fresh review refs must each have 91c as their sole parent and add only the corresponding review document. The eventual subject must carry identical bytes. Finite graph/ref/path registration and the final exact subject require follow-up verification; none is claimed completed here.

The initial tool-only exception does not remove application checks, create historical approval, weaken version-output validation, or authorize automatic recovery from uncertain execution.

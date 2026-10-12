# Requirements review — V3.25 initial runner trust migration

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

- Final reviewed implementation commit/tree: `91c4c815619d2beda4336445a0ed6aae82ee4d04` / `71395de5a0efb67ea1da50148bf3d23665a11077`

- Full reviewed range: `169aad1b6cfa747f78ae3464b614f43c0749d806..91c4c815619d2beda4336445a0ed6aae82ee4d04`

- Active graph: `c8576f1b60613ab0b424c9a6315ee64dee9c3d14d81c49dae10834bd66bc7e0a`

## Assessment

The bounded initial tool migration replaces the removed exact executable with the measured native CLI and adopts the reviewed strict parser, lifecycle and operation-bound routing. It retains Sol 6.1 High for make and Astra High for review/verify. Exact pinning, a new journal namespace and a null fixture approvalAuthority prevent this transition from claiming historical approval or resuming old proposals under a new tool identity.

The finite acceptance amendments retain 320 IDs, owner mappings and the 272 product / 28 model / 20 evaluation partitions. The reviewed range has no application Web or migration changes. It does not authorize application deployment, routing overrides, executable discovery or relaxed application gates.

Expired oracle evidence is not reused and does not require loading its historical Git object before fresh execution. Unexpired reuse retains the existing listing, artifact, run, digest and expiry checks.

The oracle wrapper durably records refusal before transport and marks process risk before executeModel. Unknown permission-probe failures and branded ownership loss retain the fence and resources. Confirmed model-process completion can clear risk; pre-transport failure can clean safely. Failed cleanup retains refusal. There is no automatic reset, expiry-based reclaim or unsafe retry.

The final host-environment correction prepares exclusive private home/tmp siblings beneath a canonical private root. HOME and CODEX_HOME use home; TMPDIR uses tmp. Missing, reused, non-private or symlinked paths reject. This corrects the observed live preflight environment failure without broadening warning acceptance, changing executable pins, or exposing the account's credential-bearing HOME.

## Independent review and evidence

The complete tool scope uses the earlier exact 892 inactive component review plus fresh installation/contract review and successive repair reviews. Original f30 REQUEST_CHANGES remains retained. The 0ae opinion was invalidated because it did not establish quiescence for an unbranded post-spawn failure; its local PASS refs must not be consumed.

Independent testing comprised 113 portable cases at 0ae, eight exact-blob recovery tests and five additional executeModel control-flow probes at f6, and seven actual filesystem/environment probes at 91c. All reported positive checks passed. Historical executions are not represented as a full 91c rerun.

The seven final probes cover unprepared-root rejection, the prepared closed environment, refusal to adopt existing children, private permissions for root/home/tmp, and symlink rejection. No credential or provider was accessed.

The graph and listing were independently recomputed. Listing SHA-256 is 080db93a9b98e75b4b2bcb14e4097e25cb745f449d2c6c3c0b022dc204afd027. Identical new base/subject listings select protected_base; old main's listing does not approve the successor. Scoped diff checking passed.

Maker-reported 137 focused passes and two pinned-version passes remain maker evidence. The previous root live attempt remains RED. Subsequent process metadata supported a separately reviewed, one-time manual cleanup of that stopped attempt; it did not establish a live PASS or authorize automatic recovery.

## Limits

This is an unsigned independent requirements/code opinion, not protected gate success, an approved-host signature, genuine model execution, deployment approval or approval to clear another uncertain ledger.

The human-authorized exception is limited to the initial tool repair PR; application PRs retain all required checks. Exact graph/ref/path registration, byte-identical review carriage, final-subject verification and actual host/model validation remain separate steps. No evidence ref or registry mapping is claimed created by this review.

# Parser runtime lifecycle release assembly

Exact base / fresh remote main: `93e44475cbb0c27beb26e4dcb68e382096a4e212`.
Six requested files are copied byte-for-byte from reviewed source `bac16865eb6abac4e726a2459ca48dc1f73d55c7`: the web systemd unit, lifecycle Python harness, PR-only quality workflow, lifecycle HANDOFF, R1 receipt-binding addendum, and focused source-check script. No historical branch merge or raw/evidence bundle is included. This handoff is the seventh source file.

The unit differs from main only by `RuntimeDirectoryPreserve=yes`; all other main entries retain exact mode/type/blob identities. The workflow, harness and documentation retain their reviewed bytes. Assembly validation is limited to six-file parity, unit reverse parity, two Python AST/compile checks without execution/pycache, Git lineage/tree identity and diff whitespace checks. Prior 19/10 contract groups and native suites were not rerun.

Historical evidence remains at `831127a05a99c83b7c3e6f9e5615ccded58a1bb5` (receipt `b9138032ccb0cdc149fb77e019f0cb1acff4b41a533f02aa8dd783f9daf7bbad`) and `22b155500d7b319611495a166effe84f9d657b1c` (receipt `e21c0a93432f733dc4c0c2277e6ce4789a4fa518474440d2fcb0d105a592ea87`). Original R1/RED and private WIP remain there/on the original local custody paths; this assembly does not change their status or copy their evidence directories.

Next: Root exact assembly review, then normal draft PR and actual hosted lifecycle/required checks. This task creates no PR, dispatch, approval ref, merge or deployment. Lifecycle/systemd/reboot/native/full app build/normal protected checks are NOT_RUN here. Natural existing CI after branch push is NOT_INSPECTED. Source review and syntax are not native or production approval.

Canonical fa55 operator-profile compatibility, production quiescent parser recovery, exact existing receipt READ and guarded retry/worker/facts/terminal verification still require separate reviewed authorization and actual checks. Adding Preserve=yes does not restore the currently missing socket. No c5b6ccf0 reupload/retry, consumed DD helper, terminal PR370..382 or production action is performed. Full goal, formal two articles, source Top20, technical/strategy/research schedule, whole closure and fixed peer remain pending. Maker does not independently approve this release; stop after delivery.

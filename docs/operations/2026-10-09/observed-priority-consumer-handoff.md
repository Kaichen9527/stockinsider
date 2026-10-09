# Explicit observed-roster source consumer

The source controller retains its existing source-only packet. The loopback
consumer can now explicitly select `--scope research_observed_v1
--snapshot-hash <admitted-roster-sha256>` using the existing four required path
and origin arguments. Omitted scope keeps the formal path. No snapshot is
inferred from an assessment, source document, response or current server head.

The observed snapshot is bound to the private attempt and completion journal.
Changing scope or snapshot cannot replay that journal. The response must match
the selected snapshot and its scope receipt, with research qualification,
strategy approval and entry eligibility still false. A mismatched response
leaves an uncertain journal and is not automatically retried. Existing formal
input hashes are retained. Controller cutoff mismatch or injected scope fields
are rejected before either write endpoint.

This is development-only authenticated loopback execution. It neither activates
collectors nor grants formal stock authority, research approval or a strategy.
Unknown publication precision remains pending and is not synthesized into an
instant. The separate source-cue and aligned-price work remains outstanding.

Acceptance includes actual HTTP observed selection, replay without a second
request, cross-scope/snapshot replay rejection, response mismatch, manufactured
entry eligibility, controller tampering and a native PostgreSQL/PostgREST/Next
case accounting for all 1,978 observed companies. The native case uses the real
EP8 public publisher description and retains its March publication and October
acquisition clocks. It is an old lead, not a new catalyst or audio transcript.

Local source-controller and scope regressions: 35 passed, zero failed/skipped.
Pre-I/O consumer cases: 4 passed. Typecheck passed after serializing the generated
authority bridge; the first parallel pre-hook failed with EEXIST and is retained
in `/tmp/stockinsider-observed-consumer-typecheck.log`. Lint: zero errors and
33 existing warnings. The first normal build rejected an external dependency
symlink; the isolated worktree now uses an APFS dependency clone. Normal build,
Linux consumer and full native acceptance results will be appended after actual
execution; they are not claimed here.

## First-release boundary

The approved first release is usable discovery, independently reviewed company
research and qualified technical observation. Full audio ASR, completed-insider
archive optimization and minute strategies are subsequent work. This does not
waive protected release review, article evidence, strategy approval, persistent
history, or five actual trading days of schedule acceptance. VPS capacity was
expanded; old October 4/8 capacity failures are historical observations.

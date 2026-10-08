# Monitoring continuation handoff

The approved monitor consumer previously started at the front of the worklist
for each bounded batch. This increment adds explicit same-day continuation using
the previous private output and journal. Every batch reacquires the fresh server
worklist and the server rechecks each submitted symbol. Held companies remain
first among unvisited current members; changed membership invalidates carried
dispositions. Rejections remain gaps, never successful saved snapshots.

Example invocation (private absolute paths supplied by trusted orchestration):

```text
node --experimental-strip-types scripts/research-monitor-controller.mjs batch
  --origin https://approved-host.example
  --output /private/cycle/batch-2.json --journal /private/cycle/batch-2.jsonl
  --previous-output /private/cycle/batch-1.json
  --previous-journal /private/cycle/batch-1.jsonl
```

Arguments above form one command. Credentials remain in the trusted process.
Only `symbol` is sent for each snapshot. A fresh first batch uses the existing
origin/output/journal arguments without predecessor flags. All new receipts are
`research-monitor-batch-v2`; old v1 receipts cannot authorize continuation.
This is an explicit contract change: `fairResumeImplemented` is now true.

Requirements/architecture at47aead2 received unsigned independent approval.
The journal's final verified/saved records bind the full receipt hash rather than
duplicating the cumulative receipt. This avoids an8MB journal overflow at the
largest possible unique four-digit cohort. Compact progress binds each original
result hash and actual controller response observation time; the complete result
stays in its immutable original batch. A hash is not an external signature.

Maker underNode22.14 passed40 tests with zero failures/skips:70 members32/32/6,
held-first, membership removal/rejoin/flag changes, explicit rejection, current
server invalidation, private-file bounds/FIFO/symlink rejection, clock/book/source/
origin changes, uncertain/truncated journals, fsync boundaries, real loopback HTTP
and original GC/transport tests. The original controller fails the selected new
70-member acceptance; an initial old assertion expected fairResumeImplemented
false and was explicitly updated under the approved additive scope. Full evidence
and source hashes are in the14-22 maker receipt. No model or production request
was made. Normal build, VM integration and exact-code independent review remain
pending; draft PR/release are not implied by the maker tests.

Trusted orchestration must exclusively own a cycle and preserve uncertain logs;
the controller cannot discover a deliberately withheld newer artifact. A new
day, book heads or source requires a new cycle. Carried snapshots are historical
observations within that day, not simultaneous validity. Operator-started fresh
cycles may recheck companies sooner. This does not renew theses, approve a
strategy, process paper risk or activate a schedule. Production/runtime and five
real trading-day acceptance remain outstanding.

## Independent real-clock defect repair

Independent review ofd495c69 reproduced a normal sequence that fixed-clock tests
missed: the first request is logged before the server creates its worklist cutoff.
The predecessor validator incorrectly used that later cutoff as the lower bound
of every earlier log. Actual loopback HTTP with25ms server delay rejected the
second batch before transport. The trace now validates order from its own first
observation; server cutoff and cycle metadata remain separate clock bindings.

The new actual-clock acceptance fails againstd495c69 and passes the successor.
All41 focused cases pass with zero failures/skips. The original40-case maker
receipt remains intact; a separate14-28 repair receipt records this red→green
result and updated source hashes. Independent final code approval, VM integration
and normal build are still required.

# Technical monitoring consumer — October 5

The existing API returned qualified companies and all paper holdings, but no
client consumed it. The new CLI obtains that list, checks holdings first and
requests actual server-generated snapshots sequentially. All skipped companies
remain visible. A breakout can return a saved snapshot while new entry remains
blocked by an expired or invalidated thesis.

## Operation

From an exact clean reviewed checkout, supply the existing distinct writer key
in the trusted environment and use an approved HTTPS origin or established
127.0.0.1 SSH tunnel:

```sh
npm run research:monitor-controller -- batch \
  --origin https://approved-origin.example \
  --output /absolute/private/monitor-receipt.json \
  --journal /absolute/private/monitor-journal.jsonl
```

The example origin is a placeholder, not a configured production URL. The key
is never supplied as a CLI argument or exported to the research model. Existing
files are not overwritten. A missing route, invalid server payload or uncertain
network response prevents a successful completion claim.

The journal contains the validated original worklist, its hash and every verified
response. Inspect it after interruption; do not reserve/retry blindly. The final
batch receipt is journaled before writing the output. An output-write failure
can therefore be recovered from that exact receipt without replaying requests.

## Limits and unresolved acceptance

At most 32 snapshots/55 seconds per batch; each response is bounded to 4 MB and
15 seconds. Held companies are prioritized but lists larger than the batch still
need fair resume. Explicit gaps and deferrals keep allTechnicalSnapshotsSaved
false. Successful snapshots do not prove official freshness, entry qualification
or actual fills; the saved decision/blockers provide those separate states.

Monthly reviews are reported as requiring independent review, without changing
the article or thesis. This CLI neither runs models nor consumes model budgets,
marks paper books, approves strategy adoption, activates schedules or places
orders. Current production lacks this stack and remains blocked by protected
review, runtime role and disk prerequisites. Live monitoring, monthly renewal,
paper-risk consumption and five real trading days are still open.

Eleven focused tests passed without skips, including real loopback HTTP. These
use synthetic membership and transport responses; they are not a production
worklist or completed research/strategy acceptance. Exact review and full root
checks are recorded separately after completion.

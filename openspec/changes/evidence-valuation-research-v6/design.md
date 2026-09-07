# Design

## Authority Flow

Every source observation is stored with provider, original source, collection time,
availability time, units, revision and validation state. Unverified mirror records are
quarantined. Validated mirrors may support research, but they do not become a second
independent source when they mirror the same official upstream.

Documents enter through an internal authenticated upload and immutable receipt. The
server binds issuer, period, object hash and source location before a bounded parser
may append facts. A receipt records accepted, duplicate and rejected facts with exact
locators. Free-form extracted facts without the controlling document are rejected.

## Valuation and Lifecycle

Valuation selection is method-driven: eight consecutive quarters and diluted-share
reconciliation for a forward bridge, at least twenty quarters for normalized-cycle
analysis, average common equity for financial PB/ROE, and explicit evidence for a
turnaround model. An acquisition failure is not a no-defensible-method conclusion.

`found` contains every valid seven-day mention. `waiting` requires Research and Data
Confidence of at least 55, defensible three-case valuation, Base upside of at least 8%,
RR of at least 1 and no material contradiction. `actionable` additionally requires
Research 70, Actionability 65, Confidence 75, Base upside 12%, RR 1.5 and two adjacent
official closes passing all technical and market gates.

## Publication and Replay

The 19:00 publication is preliminary. The 21:00 cycle freezes final provider metadata,
ordered candidate inputs and model versions, then writes research, detail revisions,
the atomic public snapshot and finally an independent replay observation. Replay reads
only the frozen payload. Preliminary, weekend, duplicate, failed and backtest runs
never increase the thirty-session count.

Public cards are compact and paginated; full articles, evidence and historical charts
load from revision-bound detail APIs. A deterministic company-specific fact article is
always available. Generated prose is accepted only when its bundle hash, claims and
citations validate against the same revision.

## Failure Semantics

Execution status, research readiness, valuation method and narrative kind are distinct.
Per-stock failures survive in the run result. Critical research or publication failure
returns non-2xx, preserves the last-good snapshot as stale read-only and disables new
action authority. Source scheduler execution is reported separately from source health.

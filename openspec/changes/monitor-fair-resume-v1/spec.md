# Fair continuation of bounded daily technical monitoring

This additive increment addresses the approved monitoring consumer's explicit
large-list coverage gap. It does not change qualification, indicators, strategy,
paper risk, endpoint authority, publication or schedules.

## Trusted continuation

The existing `batch` command remains the first batch. Optional paired arguments
`--previous-output` and `--previous-journal` admit continuation only from a fully
verified, destination-saved predecessor of the same controller commit, origin,
Asia/Taipei calendar date and exact two book heads. Both files must be distinct
from each other and new destinations, regular non-symlink files, owned by the
current OS account, private (no group/other access), opened without following
links, bounded and read from the inspected descriptor. A canonical receipt hash
is an integrity check for trusted local artifacts, not an external signature or
proof against a malicious local operator.

The predecessor journal must have one coherent request/response trace ending
in `batch_verified` and `response_saved`, each binding the complete receipt hash
without duplicating the complete cumulative receipt inside the journal. An uncertain,
truncated, failed, mismatched, future-dated, previous-day, different-source or
different-origin predecessor is rejected before any HTTP request. No operation
with an uncertain mutation outcome is automatically retried. Every new run still
uses create-only 0600 output/journal files. No original journal is changed.

## Fresh authority and fairness

Every batch fetches and validates a fresh server worklist using the existing
120-second freshness bound. The server continues to recheck current evidence,
qualification, liquidity, strategy and market authority for each symbol; the
controller supplies only the symbol. A continuation is not a caller-selected
subset or reuse of an old eligibility decision.

Within the same daily cycle and book heads, process current held symbols not yet
given a terminal disposition first, then current qualified symbols without a
terminal disposition, in stable symbol order. Current membership is authoritative:
removed symbols are not submitted, newly admitted symbols are included, and a
change to the held/new-entry flags invalidates that symbol's prior disposition.
A validated snapshot or explicit HTTP rejection is a terminal disposition for
fair scheduling in this cycle. Rejection does not mean a snapshot was saved.
Prior results keep their actual observation times and hashes; they must never be
represented as calculations performed by the new batch or current authority.

A complete cycle requires a disposition for every member of the latest worklist;
the receipt separately states whether those dispositions are saved snapshots.
The daily cycle does not attest simultaneous validity of all past snapshots,
renew a thesis, or monitor paper risk. Publication, qualification or strategy
changes without changed membership flags are picked up by the next fresh cycle;
an operator may start a fresh `batch` sooner. A new day or changed book heads
requires a new first batch instead of silently resetting continuation. An
uncertain batch cannot be skipped by continuing from its last successful ancestor.
The controller cannot detect an operator deliberately withholding a newer
artifact; trusted orchestration must retain exclusive ownership of a cycle.

## Bounds and durable accounting

Retain 32 mutation requests, 55 seconds per batch, 15 seconds per request and
4 MB response bodies. Local predecessor files are bounded (receipt 16 MB,
journal 8 MB); cumulative terminal dispositions are bounded by the existing
20,000-symbol worklist limit. Save only bounded audit fields, not upstream prose,
credentials or reusable authorization. The receipt binds its predecessor hash,
cycle identity, origin, source, current worklist hash, fresh outcomes, carried
dispositions and each deferred current symbol. Receipt/journal final persistence
remains fsynced. Malformed or oversized progress fails before writes/transport.

## Acceptance

Exercise >32 companies across consecutive batches, held-first fairness,
new/removed/changed memberships, explicit rejections, all-current-dispositions
versus all-snapshots-saved, fresh server invalidation, previous-day/book/source/
origin rejection, uncertain and truncated journals, receipt tampering, duplicate
members, symlinks/devices/FIFOs/permissions/size bounds, output failures, deadlines
and restart with immutable prior files. No live production, scheduler, model or
paper-trade result is inferred from synthetic or loopback HTTP tests.

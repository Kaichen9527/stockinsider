# V6 evidence valuation: no-global-Shadow authority amendment

Amendment version: `evidence-valuation-research-v6.1`

Status: user-approved successor implementation authority; independent requirements,
architecture, protected-base registration and exact-review evidence remain pending.
This file is not evidence and does not assert a gate PASS.

## Supersession

This amendment incorporates the approved scope in
`openspec/changes/evidence-valuation-research-v6/proposal.md`, `design.md`, and
`approved-contabo-ui-amendment.md`. It supersedes the global research Shadow
publication, classification, UI, progress and health authority previously described by
`shadow-evaluation-contract.md`. That predecessor is no longer an active artifact in
the V6 graph. Existing Shadow rows and evaluation machinery are audit-only: they may be
read for historical verification but cannot gate, promote, suppress or label a V6
research publication.

This retirement does not weaken per-stock correctness. Waiting and Actionable remain
mutually exclusive stages. They continue to require the approved valuation, data
confidence, technical, market and risk gates, and Actionable still requires two
adjacent official closing sessions. A same-day retry or non-trading day cannot advance
that per-stock confirmation.

## Runtime authority

The current run freezes its own acquisition and analysis cutoff after data collection.
Every first entrant must carry the exact producer-run, scheduler-config, legacy seed-set
and database-derived seed-membership authority. Cross-run/config substitutions fail
closed. A production total outage is derived only from the full persisted 17-profile by
5-connector terminal attempt plane; no request or caller boolean can authorize outage
suppression.

Disabled and drain states preserve the legacy response identity, perform no V3 public
query and reject public V3 paths with the canonical 404. Drain permits only the closed
status and worker-drain operations. Conditional breakout geometry remains inside the
validated immutable decision envelope while all non-buy public action stops are null.

## Evidence and release

## V6 financial-validation authority

The financial-validation receipt and runtime-retry tables are append-only V6 research
adjuncts owned by the existing `opportunity_v3_rpc_owner`; they are not additions to
the predecessor 33-function orchestration catalog. `service_role` receives SELECT on
the two audit relations and EXECUTE only on the exact successor functions
`record_official_financial_validation(uuid,timestamptz,text,text,jsonb,uuid)`,
`read_financial_facts_as_of(timestamptz)` and
`retry_candidate_financial_document_runtime(uuid,uuid,uuid)`. It receives no direct
INSERT, UPDATE, DELETE or TRUNCATE on either audit relation.

The two mutating functions are `SECURITY DEFINER`, use an empty `search_path`, bind the
fixed `opportunity_runner` principal, and preserve exact subject/provenance or retry
state before writing. Every V2 validation receipt records that principal. Because the
predecessor client could directly write both receipt JSON images, the as-of reader trusts
neither: any unbound history forces a closed pending/false state until a principal-bound
V2 receipt exists at the requested cutoff. Historical or counterfeit rows therefore
cannot promote a fact. The NOLOGIN/NOBYPASSRLS function owner receives only SELECT
RLS access to provenance and SELECT/UPDATE RLS access to document receipts; no client
role inherits that bridge. These three functions are the complete V6 research adjunct
surface; overloads, default arguments and any additional client execute grant are
forbidden.

The active successor graph must receive new independent requirements and architecture
reviews, protected-base registration and an exact-commit review. Historical evidence
for a predecessor graph cannot certify this amendment, and the implementation author
must not create self-certifying evidence.

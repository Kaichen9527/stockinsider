# Compare closes for breadth within supported company-action coverage

The private market path now binds each close to its registered stock, venue, official session and source knowledge clock. It chooses the most recent 20 available closes within 30 completed sessions and requires the signal-day close. The same authoritative company-action snapshots are checked at the cutoff and against current knowledge. Missing or conflicting inputs inside the comparison span remain explicit gaps.

The comparison applies a change-of-par-value factor only before the effective date and only when the existing terms authority supplies exactly one matching receipt with zero cash components. Missing or ambiguous terms, cash actions and later-revised action snapshots cannot be used for comparison. The result binds its revision to selected observations, the roster, calendar, action snapshots and terms receipt hashes. It keeps registered-price and action-gap counts separate by venue.

PostgreSQL first exposed a pre-existing ambiguity between the action selector's SQL aliases and its PL/pgSQL iterators. The additive migration fixes the aliases and pins the old and new function bodies while preserving the function's catalog metadata.

Contabo's disposable PostgreSQL 17.11 executed the original registry, official action-fingerprint and price-history selector code over synthetic calendars, action feeds, terms and closes. Tested an adjusted par-value change, equality, 20 of 30 closes, missing signal close, future action correction, missing or duplicate terms, a conflicting price head and the private access boundary. The full diagnostic returned 1,000 observed flat series per venue using 2,000 synthetic stocks and 60,000 closes in 5.175 seconds in one measured run.

The result is limited to the supported exchange feeds. It does not qualify wider company-action coverage or enable publication. The production schedule, services, DB and protected review are unchanged. Whole-market source completeness, actual adjacent sessions, TWSE cash terms of use and Cloud build remain pending.

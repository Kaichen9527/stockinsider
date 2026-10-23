# Source-disclosed fiscal forecast producer candidate

This implements the existing annual/forward-four-quarter source requirement. It
does not extend the original financial fact enum, relabel TTM/NTM, infer shares
from historical EPS, or approve model/semantic/production execution.

The adapter version belongs to the receipt, not a required software marker in an issuer document. Unknown surrounding prose is retained in full and cannot supply numeric operands. The bounded adapter accepts only a complete original body with the eleven exact
Chinese labels in `disclosed-fiscal-forecast.ts`, plus one annual or four explicit
common-shareholder-income rows. A row identifies starting fiscal year, quarter
(`A` for annual), exact start/end, and common-income amount in TWD. Calendar
start month, starting-year convention, basic/diluted share basis, fixed forecast
denominator and its full applicability dates must be explicitly disclosed. The
same complete body, Unicode spans and exact operands accompany the reviewer.
Unsupported real document formats remain named gaps; synthetic text does not
establish real MOPS coverage or a source's economic correctness.

Common income divided by the source's fixed forecast shares is computed with
exact integer/rational arithmetic. Nonterminating or unsupported decimal results
are refused, not rounded. Four periods must be consecutive and start at the next
wholly future fiscal quarter. Non-January fiscal quarters retain their fiscal
identity and date range and cannot populate the calendar-quarter summary. Annual
forecast EPS remains an assumption (`source_annual_forecast_eps`), never the
reported `annualEps` field. A later known corporate action requires a newer
source share declaration. Contradictory current explicit calculations suppress
both competing forecasts rather than selecting a favorable one.

The candidate migration composes two new owner-private pure/current helpers and
an invoker preparation trigger into four exact existing private bodies. It adds
no public RPC, role, table, GRANT, source-schema privilege or quota. The existing
job-scoped author reader remains the only public read entry. Original current
revision/family/publisher/source identity/complete manifest/body-hash authority is
copied with explicit purpose-name adaptation from the action source candidate.
Only MOPS original disclosure plus existing explicit current
`public_issuer_guidance/structured_numeric_forecast` permission is supported.
New preparation must retain the complete current projection within its original
execution window; provider/publication source checks revalidate immutable
receipts, complete originals and both frozen/current projection. Existing legacy
quarter/12-month-target validation remains byte-identical around a finite new
receipt dispatch. Original rows and original financial/authority migrations are
unchanged. No service/model input can supply an approval flag or arbitrary path.

The source-derived profile pins every predecessor, successor, new body, original
catalog codec and copied authority fragment. Actual catalog OIDs are unknown
until native execution. Whole before/after metadata must preserve all original
roles, membership, ACL/grantor, namespace, defaults, constraints and function
nonbody fields; only four bodies, three private helpers and the named original
table's preparation trigger are allowed. First-only/repeat and independent
readonly snapshots are implemented in the new isolated native helper. This is
not independent permission approval or production installation.

The existing preparation HTTP fixture now plans two additional original
disclosures (annual/four-quarter), actual current author RPC, complete provider
frozen input, forged denominator/period/unit/extra-field SQL rejections and two
permanent permission withdrawals. It preserves the old two scalar-estimate
assertions separately; total evidence increases from two to six because four
complete fiscal entries were added. There is no external provider POST or extra
deep attempt. A successful source contract is not native execution. The original
weekday/time/resource guards stay unchanged, so weekend business admission
remains a real temporal boundary. Full financial/publication/race/rights and
actual source/provider/independent semantic acceptance remain open.

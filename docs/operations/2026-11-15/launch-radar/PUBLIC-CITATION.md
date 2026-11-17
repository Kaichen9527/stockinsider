# Public citation boundary — separate security acceptance

Source **d68f5a33b8345e66fe324749101bd1f92abfdcc0**, locally validated identical
bd6bf3e tree. [Security receipt](launch-public-citation-checks.json) is separate
from [binary64/PG acceptance](launch-wire-checks.json).

URL safety now refuses InvestAnchors/user/vip_contents, encoded member routes,
existing paid/member substring variants, tracking/redirect links, secret query
keys (including prefixed auth/sig and bounded decoded/NFKC variants) and fragments.
It reuses the existing public-source sanitizer but rejects changed URLs rather
than silently removing credentials and preserving apparent permission. The
original private operator-claim authorization is not expanded or replaced by a
blanket host ban. A safe URL alone never proves public-content rights.

Launch public citation DTOs additionally require the closed five registered
GovOpenData1.0 datasets11370/11371/11856/11391/11755 and their exact HTTPS dataset
landing page, source capture UUID, raw content hash, rights revision, compiled
SFB attribution and license notice. SQL must independently derive these bindings
from immutable captures/profiles and CURRENT source permissions; a client hash
or well-formed DTO cannot mint rights. Unknown/private research/IR links stay
unpublished rather than being rewritten. The full SQL producer-side positive
is **NOT_RUN/pending the separate writer**, not proved by these synthetic DTOs.
The actual detail UI displays the attribution and license.

The new default-disabled public GET/api/launch-ranking reads only the shared
validated projection, with closed rankingRunId/symbol parameters, zero RPC on
invalid/duplicate/unknown parameters and no-store on every response. Errors do
not echo an input URL or backend payload. No source/queue/author/model/writer is
started by GET. Existing private owner routes and frozen legacy history remain
separate.

**8unit and6 real-Next desktop/mobile security cases PASS**. Tests use31 inert
unsafe URLs,5 unknown-rights links and6 malformed bindings:42 modes per project
are rejected by both actual SSR and actual public HTTP API without echo. The
actual command refuses caller citation/permission injection before configuration
or lease. Five synthetic licensed profile positives retain attribution and binding
metadata; they are not real rights grants. Browser traffic is limited to loopback,
all API/bridge requests forbid redirects, readiness also refuses redirects, and
all6 cases assert0 non-loopback browser attempts. The bridge reports173 synthetic
reads/0unsupported; owned processes stopped. No URL target/member article was
fetched, no private identifier/original was received, and no production or SQL
operation occurred. Native HOLD/A1 and actual source/publication gates remain.

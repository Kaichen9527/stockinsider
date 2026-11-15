# T08 source-first momentum author and reviewer contract

Reviewed preparation separates the observed quote from the financial evidence gap. The launch contract adds a versioned author and independent-review wire format. The author uses a server-sealed context that binds the original source item, the official session quote, the exact evidence hash and a typed financial gap receipt to the research input. The model supplies evidence-bound sections and claims. The server sets the quote session from that context, keeps valuation, valuation date and EPS null, and hashes the result.

The reviewer revalidates the exact author artifact and original claim evidence. Approval requires explicit confirmation of the same gap receipt. An unresolved gap can produce a rejection. Claim checking and review-source matching reuse the existing validators. The previous research format remains supported through those validators. The momentum contract includes no write, network or model call and confers no publication authority.

The replay covered 14 scenarios, including the previous author/reviewer format, valid null finance, zero volume, a source receipt or quote mismatch, a one-microsecond future observation, an unsupported value, and a review bound to a different context. TypeScript 5.9.3 passed strict checking for the exact source dependency closure in isolated Contabo staging. The three-file patch passed `git apply --check --whitespace=error-all` against the source blobs at the pinned baseline.

## Remaining connections

The prepared author context must be issued by the existing writer after validating source use and coverage, the required market data and the contemporaneous financial gap. Worker reserve, author and reviewer settlement, and the formal launch qualification need to consume the same immutable context. The launch path must call the shared queue and ledger without requiring a valuation for the launch policy. The older policy still uses its own full financial gates.

The SQL launch qualification currently leaves original-source and positive venue authority unresolved. Completeness of price, flow, market or provenance must remain a separate gate. This candidate covers the author/reviewer response boundary. Real source and model dispatch, SQL settlement, publishing, user-facing views and protected review are pending.

To reproduce, apply the patch to the pinned continuation commit in an isolated checkout. Copy the probe as `probe.mjs` at its root and run it with Node 22 `--experimental-strip-types`. The evidence JSON records the exact dependency hashes and the package lock fixes the compiler version.

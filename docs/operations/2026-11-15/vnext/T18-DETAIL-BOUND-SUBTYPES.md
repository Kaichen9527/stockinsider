# Fixed closed bound-subtype diagnostics

Before publication the staging branch was verified at
 eeff55f3287227c0c8ff1d181fee93a3ef0c27b2. It adds only the sanitized onsite receipt
`contabo-t18-historical-detail-first-bound.json` to fa22e911; its exact Gitblob is
27dda147e7c52aca58f463e6341ffdf4bcbaa73f. That original evidence remains in the new
commit's parent tree and is not replaced by this delta.

The actual run reached BOUNDS / BOUND_EXCEEDED with rawFactUrlPolicy=NOT_OBSERVED.
DB/old Next A/B/A passed; detail HTTP did not run. Its actual bound subtype remains
UNKNOWN until a new onsite observation. No true archive/key/root/Contabo action
was performed by Cloud for this change. Earlier success/failure receipts remain.

## Minimal diagnostic extension

The sole runtime replacement is t18_detail_read_adapter.py. Each of the six
EXISTING bound rejection sites adds one fixed boundSubtype:

| Fixed subtype | Original rejection class |
| --- | --- |
| DEPTH | Recursive depth |
| JS_SAFE_NUMBER | Nonfinite/outside the existing JS-safe number bound |
| STRING_BYTES | Encoded string byte bound |
| ARRAY_COUNT | Array member count |
| OBJECT_COUNT | Object member count |
| KEY_BOUND | Existing key type/length condition |

No thresholds, predicates, evaluation order, iteration order, recursion, input,
output data, SQL, URL rule, grant, role, RPC, root/unit/FD contract or asset changes.
There is no field-path or upper-domain probe. In particular, the existing depth
check still precedes scalar checks; containers still check count before members;
objects still check each key then its child in insertion order. Bool/None behavior
and string-byte versus key-length semantics remain exactly the baseline behavior.

Only an exact BOUNDS / BOUND_EXCEEDED diagnostic may carry this optional third
field. It must be an exact string from the six-value set. Other categories/reasons,
unknown strings, nonstrings or extra keys reject at the same strict projection.
Legacy two-field diagnostics remain readable. The exception string stays fixed.
No observed value, size, depth, count, key, type name, identifier, URL or exception
text is serialized; the new datum is an enum only.

Synthetic example, NOT the actual onsite subtype:

```json
{
  "status": "GAP_DETAIL_PUBLIC_JSON",
  "profileDiagnostic": {
    "category": "BOUNDS",
    "reason": "BOUND_EXCEEDED",
    "boundSubtype": "ARRAY_COUNT"
  },
  "rawFactUrlPolicy": "NOT_OBSERVED"
}
```

The unchanged prepare flow rejects before the parallel URL probe. All six actual
PG fixture rejections assert that the probe is never called and that it remains
NOT_OBSERVED; no adapter or detail HTTP capability is issued. The independent URL
incompatibility observed earlier must not be substituted for this first bound.

## Verification and staging

Synthetic tests exercise both sides of each original boundary, multibyte UTF8,
finite/nonfinite numbers, bool/None, container-before-child priority, insertion
order and simultaneous independent failures. An AST comparison with exact public
baseline blob50bfcc3d9d76758741e6c18981c0cd568d044c95 removes ONLY the new diagnostic
keyword and proves the original _bounded function unchanged. Eight SQL/query/size
constants also compare identical. No test receipt grants runtime admission.

Actual isolated nonroot PG17.11 fixtures exercise all six subtypes, unchanged
rows/catalog/grants/original RPC denial, and a bound before a later URL mismatch.
These use synthetic data only. Native Next/real-backup detail HTTP is not claimed.

Use `t18-detail-bound-subtype-stage-manifest.json`: one runtime replacement,
51 blobs remain51. The baseline includes eeff55f's evidence; runtime bytes are
otherwise identical to the already-staged fa22e911. Root source/asset paths, pins,
lock, stdin key custody, host commands, cleanup, HOLD and formal/site/new-radar
boundaries remain. Coordinate new onsite execution separately; do not infer a
compatibility fix, loosened bound or accepted detail data from this diagnostic.

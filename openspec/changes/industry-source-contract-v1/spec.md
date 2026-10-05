# Industry-only source contract v1

Approved scope: implementation batch A, based on `7c05e7c6bdc491dad4671b0341c384d35fed0c07`.

## Requirements

- `symbols` means companies directly mentioned in source material, never researcher associations. Legacy items default to `company_mentions` and retain their existing canonical content hashes.
- New `subjectScope: industry_context` means this item has no company mentions: `symbols` must be empty. It requires 1–12 industry terms, each 1–80 characters, already trimmed, without control characters or NFKC/case-insensitive duplicates. Terms are data, not company nomination authority.
- Explicit `company_mentions` is equivalent to the omitted legacy default. Its symbols remain required. Optional industry terms follow the same bounds.
- Subject scope and industry terms survive the existing authenticated inbox validation and source-row projection. Nondefault new identity fields participate in deterministic revision hashing; changing them creates a new document URL rather than overwriting a prior document.
- Reject unknown fields, malformed dates, future observations, credential-looking text, and private authenticated transcript excerpts. Preserve existing platform, rights, source-parent, revision, and retraction boundaries.
- Preserve original source-root identity and first observation. An industry-only source does not create a company association, independent company source count, changed research score, order claim or financial forecast.

## Acceptance inventory

| ID | Executable behavior |
| --- | --- |
| IS01 | Industry-only content validates and projects empty symbols plus bounded scope/terms. |
| IS02 | Industry-only fake symbols, unknown scopes and company scope with empty symbols reject. |
| IS03 | Term bounds, trim, duplicate normalization and exact JSON shape reject invalid data. |
| IS04 | Legacy and explicit-default identity remain unchanged; industry metadata changes create immutable revisions. |
| IS05 | Impossible/future/reversed clocks and authenticated transcript/credential payloads reject. |
| IS06 | Existing guarded inbox POST accepts and projects an industry-only row, rejects invalid rows before persistence. |
| IS07 | Actual controller accepts an authorized industry summary through the inbox-compatible boundary. |
| IS08 | Industry replay, repost and withdrawal preserve original source identity and clocks. |
| IS09 | Industry metadata-only, rights failures and future read results never create accepted source content. |

## Explicit non-goals and known limitations

No schema, SQL, ranking, article or nomination changes. Researcher association proof and article citation support are batches B/C, not implemented here. The validator cannot independently verify a submitter's claimed company mentions against an unavailable original body. Legacy company items therefore remain a reviewed input, not proof of true mentions.

An empty-symbol revision does not clean previously mistagged roots: the existing source-head RPC unions historical symbols. Do not use this batch to relabel old company documents or claim existing misclassification repaired. SQL schema inspection and executable route tests are not production database acceptance.

# Opportunity V3 Control-Plane Contract

Version: `opportunity-control-v3.3`

This file is the sole HTTP authority for beginning and observing V3 runs. It does not add a PostgreSQL RPC, permit synchronous draining or authorize a production schedule. The worker and human-authority routes remain governed by `job-graph-contract.md` and `auth-principal-contract.md` respectively.

## Closed route catalog

Exactly these six control paths exist:

| Method and literal path | Server-owned mode | Server-owned purpose |
|---|---|---|
| `POST /api/internal/opportunity-run` | exact body member | `ad_hoc_shadow` for `source_scan|enrich_rank`, `outcome_label_daily` for `label_outcomes`, `shadow_evaluation_daily` for `shadow_evaluate` |
| `GET /api/internal/opportunity-run/status/{runId}` | none | none |
| `GET /api/internal/opportunity-run/cron/source-scan` | `source_scan` | `production_shadow_daily` |
| `GET /api/internal/opportunity-run/cron/enrich-rank` | `enrich_rank` | `production_shadow_daily` |
| `GET /api/internal/opportunity-run/cron/label-outcomes` | `label_outcomes` | `outcome_label_daily` |
| `GET /api/internal/opportunity-run/cron/shadow-evaluate` | `shadow_evaluate` | `shadow_evaluation_daily` |

The route modules explicitly handle every other method on an existing literal path with HTTP 405, `Allow` equal to the tabled method and the canonical error below. A different suffix or the status/cron base path has no V3 handler. Every route rejects any query pair, including an empty-key pair; no provider, model, purpose, mode, cutoff or dry-run selector can be ignored.

The POST requires media type exactly `application/json` with no parameter, raw body at most 192 bytes and one duplicate-free object with keys exactly `mode,sourceCutoff`. Mode is one `opportunity_mode_v3` label. `sourceCutoff` is exactly 20 ASCII bytes `YYYY-MM-DDTHH:MM:SSZ` and is a real UTC instant at whole-second precision. Fractional seconds, offsets, whitespace, duplicate/unknown keys and normalization-by-rounding are invalid at request-schema precedence. Whether that syntactically valid instant exceeds database time is decided only inside `begin_opportunity_run_v3` against its transaction-captured `beginAt`; the route never compares an application clock.

The status path parameter is exactly one lowercase canonical UUID string. It has no request body; a present nonzero `Content-Length`, transfer-encoded body or read byte is invalid. Cron paths have no body and derive mode, purpose and cutoff solely from the literal path. A cron request first reads the one greatest row from the exact canonical-cutoff calendar view in `trading-calendar-contract.md`; the source cutoff is that row's stored `canonicalCutoff`, converted to the exact UTC grammar, and the route retains its `taiwanSessionAuthorityHash` only as the required begin argument below. The view never returns a future cutoff and resolves each row at that same returned cutoff, not at statement time. No row or an integrity-failed calendar returns `calendar_unavailable`. A cancelled/non-composite date at its canonical cutoff is not selectable, so the preceding completed date remains the greatest valid row. Corrections recorded after a row's cutoff cannot retroactively change that row; a later ad-hoc run may use a later cutoff. The four cron paths therefore converge on the same cutoff and hash for the same effective session.

## Authentication and precedence

POST and status require exactly one `Authorization: Bearer $INTERNAL_API_KEY`, a nonempty configured `INTERNAL_API_KEY`, no `X-Internal-Key`, no request actor and byte equality to that key; after the exact precheck they call and inspect the unchanged `requireInternalAuth(req)`. `CRON_SECRET` cannot authorize either path. Cron paths require exactly one `Authorization: Bearer $CRON_SECRET` and a nonempty configured `CRON_SECRET`; `INTERNAL_API_KEY`, `X-Internal-Key` and request actors cannot authorize them. Cron authorization is checked directly because the unchanged legacy helper prefers `INTERNAL_API_KEY` when both variables exist.

Precedence is total:

1. unmatched method, query, media/body framing or path-parameter grammar;
2. applicable bearer/configuration authentication;
3. parsed body/cutoff/mode lexical schema, with no database-time comparison;
4. exact V3 service-client acquisition from `auth-principal-contract.md`;
5. cron calendar read when applicable;
6. begin RPC or status read and its exact result/error validation.

No earlier failure constructs a client. Offline acquisition performs zero Supabase/network/database calls and zero writes. The fixed `opportunity_runner` principal is the only principal passed to begin; a request never supplies it.

## Canonical responses

Every object is encoded as UTF-8 RFC-8785 canonical JSON. Every response has `Cache-Control: private, no-store`; every object response also has exactly `Content-Type: application/json; charset=utf-8`.

A successful POST or cron begin returns HTTP 202 and exactly:

```text
{attemptRunId,disposition,runId,status,statusRef}
```

`disposition` is the exact `existing_success|existing_active|created` begin result, IDs/status are byte-equal to the RPC row, and `statusRef` is exactly `/api/internal/opportunity-run/status/{attemptRunId}`. `created` requires `status=preparing` and identical IDs; `existing_active` requires `preparing|running` and identical IDs; `existing_success` requires `status=success` and identical IDs. Any other nullability/value combination is `control_integrity_failure` rather than a repaired response. The exact begin arguments are only server-owned `(mode,runPurpose,sourceCutoff,expectedTaiwanSessionAuthorityHash,callerPrincipal)`: POST passes a null expected hash and cron passes the exact non-null hash read at call 1. Preparation/comparison keys and input-run IDs are absent from the HTTP body and RPC arguments and are derived only inside begin.

A successful status read returns HTTP 200 and exactly:

```text
{canonicalRunId,failureCode,runId,status}
```

It describes the requested attempt, not a followed projection. `canonicalRunId` is non-null exactly for `converged`; `failureCode` is non-null exactly for `failed`; every other combination is `control_integrity_failure`. Status is current operational status, unlike the historical public-projection selection in `data-contract.md`. The route performs no write, job claim or warning/projection read.

Error responses are exactly:

| HTTP | Body | Additional header |
|---|---|---|
| 405 | `{code:'method_not_allowed',error:'opportunity_control_request_rejected'}` | `Allow` equal to the sole method |
| 422 | `{code:'invalid_request',error:'opportunity_control_request_rejected'}` or `{code:'future_source_cutoff',error:'opportunity_control_request_rejected'}` | none |
| 403 | `{code:'authentication_rejected',error:'opportunity_control_request_rejected'}` | none |
| 404 | `{code:'run_not_found',error:'opportunity_control_request_rejected'}` | none |
| 409 | `{code:'missing_source_run',error:'opportunity_control_request_rejected'}`, `{code:'multiple_source_runs',error:'opportunity_control_request_rejected'}`, `{code:'bound_violation',error:'opportunity_control_request_rejected'}` or `{code:'control_integrity_failure',error:'opportunity_control_request_rejected'}` | none |
| 503 | `{code:'calendar_unavailable',error:'opportunity_control_request_rejected'}` or `{code:'v3_service_role_unavailable',error:'opportunity_control_request_rejected'}` | none |
| 500 | `{code:'control_internal_error',error:'opportunity_control_request_rejected'}` | none |

The status read's zero rows alone maps to `run_not_found`; duplicate/malformed rows map to `control_integrity_failure`. The exact begin exception catalog is closed: `PT422/future_source_cutoff` maps to the shown 422; `PT409/missing_source_run`, `PT409/multiple_source_runs` and the label-input sentinel's `PT409/bound_violation` map to their shown 409 codes; `PT409/data_integrity_failure` and `PT409/calendar_authority_mismatch` map to `control_integrity_failure/409`; `PT403/principal_role_unavailable` maps to the identical public `authentication_rejected/403` body, including every absent/inactive/expired/conflicting database binding, without exposing or changing the database message. When begin conditions collide, the six-step internal precedence in `runtime-transaction-contract.md` v3.17 chooses the sole SQLSTATE/message before this wire mapping; the route never retries or reclassifies it. No other expected begin message exists. A remote 401/403 before a database function executes maps to `v3_service_role_unavailable` at the exact call position. Every other SQLSTATE/message, timeout, 5xx, malformed response or uncataloged exception maps to 500 and never exposes a raw database/helper/configuration value.

## Exact database calls and durable effects

- POST success: exactly one five-argument `begin_opportunity_run_v3` call with null expected calendar hash and no preparation/comparison/input argument. Created commits the database-derived run keys, exact mode-owned inputs and bootstrap job/payload atomically; existing dispositions add no run/job/input row beyond the RPC's one immutable audit disposition.
- Cron success: exactly one bounded canonical-cutoff calendar view SELECT, then one five-argument begin RPC with that row's hash and no key/input argument. Begin re-resolves the greatest completed session at the supplied source cutoff inside its transaction and requires byte-equal hash before any run/input/job/payload/audit insert. The SELECT writes nothing.
- Status success/not-found/integrity result: exactly one indexed `opportunity_run_status_read_v3` view SELECT and zero writes.
- Remote 401/403 on the first addressed call stops at one call and zero writes. On a cron begin after the calendar read it stops at two calls; the first read wrote nothing.
- Every catalogued begin exception rolls back the entire function: zero run, input, manifest binding, job, payload or RPC-audit row is added. This includes a cutoff after `beginAt`, missing/multiple upstream lineage, principal binding rejection, bootstrap conflict and cron hash mismatch. A non-credential ambiguous failure on begin permits only the PostgreSQL-atomic outcomes fully rolled back or fully committed once; the route returns 500, performs no speculative status/fail call and a retry converges through the preparation key.

`opportunity_run_status_read_v3` is a security-invoker, barrier view exposing only `(run_id,status,failure_code,canonical_run_id)` from `opportunity_runs`. `service_role` has bounded SELECT, while `anon|authenticated` have none. The status route filters equality on one UUID and requires zero or one row. The current-calendar view and all calendar identities are exact in `trading-calendar-contract.md`.

Executable acceptance must enumerate the six paths and every wrong method/query/media/body/path/auth/client/calendar/RPC collision; exercise lexical-valid cutoffs before/equal/after database `beginAt`, every closed begin exception, and cron immediately before/equal/after 16:00 Asia/Taipei; verify exact bytes, headers, call counts and durable rows for all three begin dispositions and five operational statuses; inject late calendar cancellation/reactivation before/equal/after the selected cutoff and prove the view hash equals begin's re-resolved hash; and prove that no unlisted control route or ignore/reject branch exists.

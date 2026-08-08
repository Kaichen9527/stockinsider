# Legacy Radar Correctness Contract: source-led-opportunity-engine-v3

Version: `legacy-radar-correctness-v3.11.4`

This is a correctness repair to the existing `/api/radar/*` product while
`SOURCE_LED_OPPORTUNITY_V3` remains disabled. It is not the V3 shadow projection and
may not query V3 tables, run V3 jobs or alter `/api/opportunity-v3` deployment gating.

## Compatibility seam

The existing legacy keys, arrays, card fields and their relative ordering are retained.
V3.11 adds only the fields below. If every V3.11 additive field is recursively removed,
the resulting object must equal the new reviewed `legacy-baseline-lock-v3.11` fixture
byte-for-byte; old clients that ignore unknown members therefore retain behavior.
The earlier v3.10 byte lock is historical and is superseded only for these additive
members. It is not permission to rename/remove/reinterpret a legacy member.

`SOURCE_LED_OPPORTUNITY_V3=disabled|drain` still makes `/api/opportunity-v3` return its
exact zero-query disabled 404 and omits every `OpportunityEngineV3` member. The legacy
correctness projection is feature-independent, stored outside V3 tables and never
weakens that gate. In disabled/drain fixtures, toggling only the V3 variable leaves
the complete V3.11 legacy payload byte-identical.

The independent consumer switch is
`LEGACY_RADAR_CORRECTNESS_PROJECTION=disabled|enabled`; unset is exactly `disabled`
and any other value is invalid. While disabled, every legacy route uses its reviewed
pre-V3.11 read path and performs zero projection query, so committing/deploying this
code does not activate the new producer or read model. Enabling is a later production
authority checkpoint and is permitted only after the tracked producer has published,
rehash-verified and read-only-smoked fresh rows for all four windows. The bootstrap
order is therefore: keep the switch disabled, run the reviewed additive migration,
install the reviewed producer, capture one terminal four-window projection, verify
consumer/producer identity and rollback, then separately enable the consumer switch.
No step in the current Code Gate changes either production variable.

## Additive public types

Every recommendation card in `opportunities`, `scenarioUpsideCandidates`,
`earlyWatchlist`, `recentFormal7d`, `fallbackOpportunities90d` and `hotTracking`
contains exactly one additive `researchDecision`:

```ts
type LegacyResearchDecisionV311 =
  | {
      version:'legacy-research-decision-v3.11.0';
      availability:'unavailable';
      reason:'projection_missing'|'projection_stale'|'source_unavailable'|
        'insufficient_adjusted_history'|'financial_inputs_missing';
      researchMaturity:'source_signal';
      newPositionAction:'valuation_review';
      lastEvaluatedAt:string|null;
      analysisGeneratedAt:null;
      materialChangeHash:null;
      materialChangedBecause:[];
      noChangeMessage:string|null;
    }
  | {
      version:'legacy-research-decision-v3.11.0';
      availability:'available';
      researchMaturity:'source_signal'|'fundamental_review'|'decision_ready';
      newPositionAction:'avoid'|'valuation_review'|'wait_trigger'|
        'event_starter'|'starter_now';
      fundamental:{
        thesis:string;          // NFC single line, 1..240
        latestChange:string;    // NFC single line, 1..200
        risks:string[];         // 1..4, each 1..160
        evidenceRefs:string[];  // 1..8 opaque refs
        asOf:string;
      };
      technical:{
        availability:'available'|'unavailable';
        state:'below_support'|'reclaim_required'|'at_support'|
          'breakout_pending'|'breakout_confirmed'|'extended'|'invalidated'|null;
        trigger:{kind:'reclaim'|'breakout'|'pullback';threshold:number;
          volumeRatioMinimum:number|null}|null;
        entryZone:{kind:'market_zone'|'trigger_zone';lower:number;upper:number}|null;
        invalidation:{stop:number;thesisLevel:number}|null;
        asOf:string;
      };
      valuation:{
        status:'normal'|'valuation_review';
        method:'pe'|'normalized_pe'|'ev_ebitda'|'pb_roe'|
          'residual_income'|'nav'|'ev_sales'|null;
        bear:{value:number;asOf:string;sourceRefs:string[]}|null;
        base:{value:number;asOf:string;sourceRefs:string[]}|null;
        bull:{value:number;asOf:string;sourceRefs:string[]}|null;
        confidence:number|null;
        reasons:string[];       // closed valuation reasons, max 8
      };
      lastEvaluatedAt:string;
      analysisGeneratedAt:string;
      materialChangeHash:string;
      materialChangedBecause:Array<
        'source_evidence_changed'|'financial_fact_changed'|'price_trigger_changed'|
        'technical_state_changed'|'valuation_changed'|'risk_changed'|
        'factor_correctness_changed'
      >;
      noChangeMessage:string|null;
    };
```

Available `source_signal|fundamental_review`, any valuation status other than normal,
and unavailable technical data cannot serialize
`event_starter|starter_now`. A normal target triple requires finite
`0<=bear<=base<=bull`, the same method, source dates and at least one ref per scenario.
A review valuation requires all scenario values null. Entry/stop geometry is copied
from `technical-decision-contract.md`; legacy placeholder `"-"` is forbidden.

Each radar payload also adds:

```ts
type SourceSignalCardV311 = {
  symbol:string;
  chineseName:string|null;      // exact nullable official public name; never truncated
  researchMaturity:'source_signal';
  newPositionAction:'valuation_review';
  discoveredAt:string;
  sourceClass:'official'|'public_research'|'curated_thesis'|'community';
  sourceSummary:string;         // NFC single line, 1..180 code points/<=720 bytes
  evidenceRefs:string[];        // 1..5 unique opaque refs, each <=120 code points/480 bytes
  valuationStatus:'pending'|'review_required';
  technicalState:'below_support'|'reclaim_required'|'at_support'|
    'breakout_pending'|'breakout_confirmed'|'extended'|'invalidated'|'unavailable';
  changedBecause:'new_in_seed_symbol'|'new_out_of_seed_symbol'|'new_source_evidence'|
    'material_source_change';
};
type DiscoveryDeltaV311 = {
  asOf:string;
  entrants:Array<{symbol:string;reason:'new_in_seed_symbol'|'new_out_of_seed_symbol'|
    'new_source_evidence'|'material_source_change'}>; // max 30
  exits:Array<{symbol:string;reason:'evidence_expired'|'roster_ineligible'|
    'material_contradiction'|'ranking_cap'}>;          // max 30
  continuations:Array<{symbol:string;reason:'refreshed'|'unchanged'}>; // max 60
  unchangedReasonCounts:Record<'same_material_evidence'|'duplicate_claim'|
    'candidate_cap'|'shallow_cap'|'deep_cap',number>;
};
```

## Factor and valuation addendum

The compact projection adds only these typed fields to `researchDecision`; removing
them preserves the reviewed legacy byte lock: `factorAxes`,
`technical.maDeviation`, `valuation.relativeMultiple`, `valuation.status`,
`lastEvaluatedAt`, `analysisGeneratedAt`, `materialChangeHash` and
`materialChangedBecause`. `factorAxes`, relative multiple and MA deviation use a
closed `{availability:'available',...}|{availability:'unavailable',reason}` union.
They never serialize `"-"`, a guessed value, or a stale live-table read.

When the operating bridge is incomplete, contradictory, lacks company-specific
cutoff-valid evidence, has insufficient peers, or its mandatory methods diverge,
the card has `newPositionAction:'valuation_review'`, null target scenarios and no
buy-like public stop. A reported PE is an official point-in-time observation only;
its own history and the same-session sector reference are explanatory and cannot be
replaced by a model multiple. A `reclaim_required` technical card exposes the former
support solely as a reclaim trigger/resistance, not as a pullback entry above market.

Top-level `sourceSignals` is max 30, ordered discovery priority then symbol, unique and
disjoint from recommendation cards with the same material hash. A source signal never
has target, size, buy zone or dispatch eligibility. `discoveryDelta` counts must equal
the immutable candidate ledger and do not manufacture entrants/exits. An entrant
reason is copied from its matching promoted/refreshed ledger row and must be one of
the four literals above; an unknown/prose reason, a reason from an unchanged or
rejected row, or a count/member mismatch rejects the whole projection. A roster row
whose legal name is 41..120 code points and has no short name serializes
`chineseName:null`; truncation, a synthesized alias or omission is invalid.

## Precomputed projection authority

The tracked producer writes complete compact payloads into the dedicated
`legacy_radar_projections_v3_11` read model only through
`append_legacy_radar_projection_v3_11(legacy_radar_projection_input_v3_11,job_id,
owner_token)`. Direct service-role DML is forbidden. The matching leased job must be
`compact_radar_projection`, and the function verifies:

```text
projection_key = legacy-radar-v3.11:<daily|three_day|weekly|home>:<asOf>:<payloadSha256>
window         = daily|three_day|weekly|home
as_of          = normalized whole-second UTC asOf
payload_sha256 = lowercase SHA-256 of RFC8785 payload bytes
producer_commit_sha,worker_sha256,material_change_root =
  the matching leased run/revision lineage
```

Payload schema is `legacy-radar-projection-v3.11.0`. The RPC inserts once and returns
the retained projection UUID on a byte-identical key retry; a differing collision is
`data_integrity_failure`. It records the projection ID/checksum in the job result
before the job/run can succeed. The table/ACL/retention state machine is exactly
`storage-schema-contract.md`: no legacy `runtime_artifacts` row, policy, index, grant
or cleanup branch is changed. A checksum/key/lineage mismatch is invalid and cannot
be served.

Each literal request path performs one bounded projection selection and JSON parse:

| Method/path | Required window |
|---|---|
| `GET /` | `home` |
| `GET /api/radar/daily` | `daily` |
| `GET /api/radar/hot` | `three_day` |
| `GET /api/radar/weekly` | `weekly` |

Selection has the literal `window=$requiredWindow` predicate, orders
`as_of DESC,created_at DESC,projection_id ASC`, uses `LIMIT 2`, requires the greatest
row and fails `projection_conflict` when two rows tie on both timestamps with
different checksums. The exact supporting index is
`(window,as_of DESC,created_at DESC,projection_id ASC)`. At most 24-hour-old valid
payload is served degraded. On the three JSON radar routes an older, missing or
corrupt payload returns bounded 503
`{"error":"radar_projection_unavailable","retryable":true}`; the server-rendered
homepage rejects the render without invoking its slow legacy/provider path and is
returned as the framework's non-cacheable server-error response. The handler never calls
discovery, quote, source, financial, model, ingestion or deep-research providers and
never writes. ETag is exactly `"sha256:<checksum>"`; matching `If-None-Match` returns
304 empty body, otherwise 200 full payload. Cache-Control is
`public, s-maxage=60, stale-while-revalidate=300`.

## Performance oracle

The mandatory harness uses the reviewed production build, Node 22, one server process
limited to 2 vCPU and 4096 MiB, a local seeded PostgreSQL fixture containing exactly
1,500 projection rows in each of the four windows (6,000 rows total), disabled
outbound network, and instrumentation around every provider/producer/research
entrypoint. Before HTTP timing, `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)` for every
literal window must use the exact window/as-of index through its `LIMIT 2`, with no
Sort or Seq Scan node and at most two returned rows. It issues no `If-None-Match`,
requires status 200 and consumes the full body.

For each of the four paths above, perform three unmeasured warmups then 20 sequential
warm measurements. Nearest-rank p95 is the sorted sample at one-based
`ceil(0.95*n)` (sample 19 for n=20) and must be `<=1.5s`. Cold p95 uses 20 independent
fresh Node `next start` processes, begins timing after the TCP listener is ready but
before the first request, clears only process memory (not the seeded database), and
must be `<=5s`. The process is terminated after its single response.

Run one simultaneous five-request batch containing `/`, each of the three radar paths,
and authenticated `GET /api/internal/health-check`; every response must finish within
10 seconds. The fixture internal bearer is injected only into that health request.
Across every measured request, provider/producer/research call counters must all remain
zero and projection selections exactly one per request.

Raw UTF-8 body limits are: homepage HTML `<=250,000` bytes; daily/hot/weekly JSON each
`<=150,000` bytes. The harness measures before transfer compression. Source/research
detail collections beyond the inline bounds expose read-only cursor pagination and are
not embedded in these payloads.

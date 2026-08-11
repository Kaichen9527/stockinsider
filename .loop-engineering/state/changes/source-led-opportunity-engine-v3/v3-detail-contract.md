# V3 Detail Projection Contract: source-led-opportunity-engine-v3

Version: `opportunity-detail-v3.3`

## Route and authority seam

Every V3 radar card has `detailPath = /opportunity-v3/{runId}/{symbol}`. `runId` is the available enrich-run UUID and `symbol` is the card symbol; the serializer rejects any other path. The Next.js page and its JSON loader read only `opportunity_detail_projections_v3` joined to the same `opportunity_runs.status='success'`. Missing/malformed run or symbol, a non-success/converged run, absent projection, contract/acceptance-version mismatch, canonical/JSON mismatch or payload-hash mismatch returns the one 404 contract below. It never reveals which predicate failed, selects a later/canonical convergence target, or falls back to legacy data.

```ts
type OpportunityDetailUnavailableV3 = {
  contractVersion: 'opportunity-detail-v3.3';
  acceptanceVersion: '1.46.0';
  availability: 'unavailable';
  status: 404;
  reason: 'detail_not_available';
  disclosure: 'V3_SHADOW_RESEARCH_NOT_INVESTMENT_ADVICE';
};
```

The JSON loader always returns HTTP `404`, `Content-Type: application/json; charset=utf-8`, `Cache-Control: private, no-store`, and the UTF-8 RFC-8785 canonical bytes of exactly that object with no run/symbol/error metadata. The page renders the same fixed unavailable reason and disclosure. Unknown fields or another status/reason fail serialization.

The page must not import or call `getStockDeepDiveLookup`, `getStockTechnicalLookup`, `queueStockResearchRefresh`, `runStockResearchRefresh`, legacy thesis/report builders or any connector/provider fetch. GET has no write, queue, revalidation or background-refresh side effect. Static import tests and runtime DB-spy tests enforce zero writes and zero legacy refresh calls.

Existing legacy cards and `/stock/{symbol}` remain unchanged. V3 cards link only to `detailPath`. A V3 page may show a plain labeled legacy-navigation link only if the user explicitly clicks `查看既有版研究（資料口徑不同）`; it is never automatic and no legacy field is embedded in the V3 payload.

## Bounded payload

```ts
type OpportunityDetailV3 = {
  contractVersion: 'opportunity-detail-v3.3';
  acceptanceVersion: '1.46.0';
  mode: 'shadow';
  decisionAuthority: 'research_only';
  runId: string;
  sourceRunId: string;
  sourceCutoff: string;
  symbol: string;
  chineseName: string|null;
  card: OpportunityCardV3; // public card; every sizing key is forbidden
  verifiedChangeBrief: VerifiedChangeBriefV3|null;
  sourceEvidence: Array<{
    ref:string;
    sourceKey:string;
    sourceClass:'official'|'public_research'|'curated_thesis'|'community';
    effectiveAt:string;
    linkReason:MentionReasonV3;
    verificationTier:'provenance_verified'|'publisher_verified';
    stance:'supports'|'contradicts';
  }>;
  horizonDetails: Array<{
    horizon:HorizonV3;
    rank:number;
    score:number;
    scoreConfidence:number;
    availableWeight:number;
    factors:Array<{key:FactorKeyV3;value:number|null;contribution:number;status:'available'|'missing'|'stale';evidenceRefs:string[]}>;
  }>;
  decisionEvidence: {
    marketContextRef:string;
    sectorCycleRef:string;
    financialManifestRef:string|null;
    scoringManifestRef:string;
    valuationManifestRef:string|null;
    blockReasons:DecisionBlockReasonV3[];
  };
  disclosure:'V3_SHADOW_RESEARCH_NOT_INVESTMENT_ADVICE';
};
```

The referenced `OpportunityCardV3` is exactly the complete card in `data-contract.md`
version `source-led-opportunity-v3.6`, including `researchMaturity`, `fundamental`,
`technicalDecision`, `valuation`, `lastEvaluatedAt`, `analysisGeneratedAt`,
`materialChangeHash`, `materialChangedBecause` and `noChangeMessage`. An older v3.1
card or any unknown member fails serialization.

`card` is byte-equivalent to the radar card for that run/symbol, including `detailPath`, and therefore contains the public sizing-omitted action decision. `verifiedChangeBrief` byte-equals the workspace brief when the symbol is in a verified-change lane and is null for another underlying deep card. `sourceEvidence` follows the same unique-ref traversal as the card and is capped at 12. Each row must originate from a claim backed by a same-run linked mention whose stock and symbol equal this detail candidate. Its `verificationTier` and `stance` byte-equal the persisted normalized-claim columns derived by `source-matrix.md` and `entity-link-contract.md`; the detail builder may not map, infer, omit or recompute either enum. Cross-run, cross-stock or cross-symbol evidence fails finalization with `conservation_failure`. Every deep-success card has exactly three `horizonDetails` in enum order `momentum_5_20d`, `swing_20_60d`, `thesis_120_250d`; each points to the same run/symbol's sole successful score snapshot. A missing, duplicate, extra or cross-run snapshot fails finalization with `conservation_failure`, so a successful run can never expose a partial detail. Each horizon has exactly six factor rows in factor enum order; `missing|stale` has a null value rather than a fabricated zero, while `available` has a finite 0..100 value; each factor has at most three opaque refs. All strings use the global data-contract limits; arbitrary summaries, raw connector text, request metadata, model output and secrets are forbidden.

The detail projection is built and schema-validated before run finalization from immutable run-owned snapshots. Its canonical bytes/hash are stored in `opportunity_detail_projections_v3`; later observation, correction, connector or legacy refresh cannot change it. A correction creates a new run/detail path.

## UI labeling

The page displays, above any action:

- `V3 影子研究 — 非正式推薦／非投資建議`;
- immutable source cutoff and run ID;
- formal research status separately from research-only new-position action;
- valuation status/reasons and market/sector timing context;
- source provenance and missing/stale factor states;
- the fixed disclosure literal.

It never labels `event_starter` as formal, never claims knowledge of user holdings, never displays a model as decision authority and never merges V3 actions into legacy recommendation/strategy/alert UI state.

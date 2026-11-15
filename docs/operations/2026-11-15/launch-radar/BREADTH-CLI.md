# Fixed-source private breadth replay

Use source **b6d148adfffe75333a806aa318feeb01a3f31878** in an isolated readonly/no-network process with the existing pinned Node22 runtime. No source collector, DB or permission installation:

```sh
node --no-warnings --experimental-strip-types web/scripts/launch-official-replay.mjs \
  --root work/PRIVATE_0700_DIRECTORY --manifest work/PRIVATE_0700_DIRECTORY/manifest.json
```

Keep original CSVs and metadata private. The existing CLI validates private root mode, regular files, no-follow descriptors and bounded reads. Public output is aggregate metadata/digests only. Exact input top keys: schema,datasetId,throughSession,cutoff,capture,sessions,roster,responses. schema=launch-tpex-11371-breadth-observations-v1,datasetId=11371. sessions are sorted unique dates ending at throughSession,<=30; fewer than30 retains warmup gap. Caller-supplied dates/roster are unverified metadata, not approval.

roster is exactly {revision:SHA256,availableAt:zone-aware-ISO,symbols:sortedUniqueFourDigitSymbols},<=5000. capture is exactly {repository,sourceCommit,workflowPath,runId,runAttempt,startedAt,completedAt}; workflow tuple is all-null or complete. Actual completion strictly precedes cutoff, page observation is within capture clocks and after the report close. Preserve later acquisition times; no Nov15 replay can qualify Nov13 publication.

Each response is exactly {session,sourceUrl,observedAt,publisherPublishedAt,httpStatus,redirectCount,contentType,bytes,rawSha256,body}. Use the registered11371 legacy dated URL from tpexNativeShareCsvUrl(session), including d=ROC/MM/DD; do not substitute date=. publisherPublishedAt remains null. Body is exact {encoding:'file',path:'bodies/PRIVATE_BASENAME.csv'}, {encoding:'base64',data:...}, or {encoding:'absent'}. Decoded bytes require status200/zero redirects/CSV MIME; no credentials/query additions. At most30 pages,500000bytes/page,15000000total, exact16 native headers and requested date on every row. Canonical CSV-row digest differs from original raw-byte SHA.

Output retains each page's raw/canonical digest and actual observation clock plus bounded counts. It never emits raw prices/names/URLs/full text or grants source/roster/calendar/CA/market/publication authority. qualifiedBreadth,caComparableCoverage and aggregateMarketGate stay null. Missing/modified bytes fail or remain gaps; no actual source acceptance is inferred from a valid manifest.11764 is a distinct next profile, not accepted by this exact schema.

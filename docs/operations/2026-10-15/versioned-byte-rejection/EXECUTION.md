# Actual local byte-bound execution; original RED retained

Executed original subject `594eaf16457ffb7526f0888922fc8612e893ac75`, then one evidence-supported test-only successor `c462a51ceea1b69026b38ec40b105eb971d24116`. Branch remains based on594; no main/history merge. Original app/controller/binding/material/schema/SQL/profile/role/catalog/HBA/locks/pins/limits and old green test entries are unchanged.

## First RED and narrow fixture correction

Original run: **0 PASS / 2 FAIL** (one attempted AUO child plus parent; EMC not reached by fail-fast). AUO first seal actually completed and its valid stored payload/request hashes and schema checks passed. The subsequent snapshot wrapped whole ledger rows/arrays around the material and wrongly called product `completeHash` on that audit envelope. Stored payload depth11 is valid; even the minimal ledger wrapper has depth14, beyond original material depth12. An offline probe of the retained first-seal payload verified its stored hash and reproduced rejection of the audit wrapper. No new business operation was used for diagnosis.

The sole test fix imports Node createHash and computes SHA256 of UTF8 JSON.stringify of the exact observer ledger projection for the **audit hash only**. Original product completeHash checks on canonical request/payload remain, as do full deep ledger equality and all nine original DB row hashes. No product depth/cap/schema/expected error changed. Initial source, stdout/stderr, failure stage, first-seal data and per-case PG logs remain local and indexed; not rewritten as PASS.

## Changed-input native result

One fresh corrected execution: **3 PASS / 0 FAIL / 0 CANCELLED / 0 SKIP / 0 TODO**, comprising2 children plus1 parent, 21.292 seconds. Mandatory pre-ESM FS preload, serial concurrency, actual Node22.14.0/PG17.11 and OS-derived USER were used with existing locked dependencies and proxy/CA. Neither old6-case nor old2-case entry was imported or rerun.

| Case | First preparation | First seal charge | Second preparation | Count/bytes before rejected seal | Outcome |
|---|---:|---:|---:|---|---|
| AUO compat30 +400 → v3 29 |45908|189057|44442|3 /279407|P0001 complete_byte_bound|
| EMC v3 30 +1300 → compat29 |99909|191434|96642|3 /387985|P0001 complete_byte_bound|

Both first seals and second preparations succeeded through original scoped RPCs, same job/attempt/reservation. Both second seal attempts rejected exactly `P0001 complete_byte_bound`. Each case retains five full stage snapshots: initial preparation, first seal, before second preparation, before rejected seal and after attempt. Nine-table count/full-row hashes, complete ledger/hash and count/charge agree before/after rejection. First stored payload/request/input hashes and original clocks remain unchanged. Preassert sees no new source opens; postassert holds all expected FDs; seal attempt happens after confirmed source closes. All qualification flags remain false.

**Actual rejected would-charge and rejected total remain null/pending.** Original RPC does not return them. The earlier533717/534378 totals remain only source-derived predictions and are not substituted for observed values. This execution proves the original rejection path plus zero ledger/table mutation for these synthetic cases, not an exact rejected charge value. Source IDs<=30 and all original limits remain unchanged. Long synthetic .invalid locators are not independent news roots or proof of downstream author-packet<=800/publication compatibility.

## Resources and cleanup

Original manual window:2026-10-15 00:34:18–00:54:18 Asia/Taipei. The first run lasted9.757s; corrected run21.292s; no overlapping work. At250ms sampling, peak aggregate test-session plus PostgreSQL RSS: initial550432768 bytes; corrected527605760 bytes. Shared PG memory may be counted repeatedly; this is sampled RSS, not exact instantaneous peak. Lowest observed free space: `/workspace`8603508736, `/tmp`15300825088 bytes, above8589934592 throughout. No cache deleted or reserve lowered.

Three attempted fixture clusters (initial AUO and corrected AUO/EMC) have independent pre/post-cleanup logs, confirmed shutdown, removed disposable cluster paths and absent writer/observer PID paths. All observers were distinct READ ONLY connections; no active PostgreSQL process remained. No services outside the fixtures were started.

## Evidence and boundaries

All private full-row/payload/principal/source data and original server logs stay local under `/tmp/byte-rejection-exec-o15`; previous `/tmp/cross-wire-exec-o14` raw remains untouched. Git contains only safe metadata/hash inventories, a whitelist-derived witness and this handoff. The witness is **maker-derived**, not independent native approval. Both executed sources have separate manifests; the original source-only handoff and all historical REDs remain historical.

No npm/build/browser/HTTP/remoteDB/VPS/crawl/strategy/schedule/deploy/protected/PR action occurred. Full existing-callers/old77/replay/ABA/freshness/response-loss/whole S-C-B-Q-R-A, formal peer/production authority and publication compatibility remain outside this bounded run.

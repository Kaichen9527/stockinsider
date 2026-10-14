# Legacy77 source-only independent review

Subject305074af2547316078e930de8ad81a910860c8c0 / evidence6a136516934a3fe8442a47b55c8f450b897102a5. REQUEST_CHANGES: P0=0, P1=0, P2=1. This is source/harness review, not complete protocol/native approval.

Root independently verified 255 actual Git source blobs, 15 published raw files/42618bytes and maker receipt SHA9231af220d74dbb0e74991e18b7a8d3f6ccabcd0d985e4d40c07efd83bacc4e2. Decoded26 retained original files equal exact15d4 Git bytes;22 metadata entries recompute77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41 and original proof267184ec.14 original financial files equal75d;2 original SQL equal15d4. Original sources/data/SQL are unchanged. Root read new helper/child/native entry and inherited fixture diff; no PG/app/native/npm/build executed.

## R1 [P2] Confirm actual child termination before fixture cleanup

research-legacy77-realm-fixture.mjs:28 resolves its exit promise from child error, and lines41-42 clear watchdog/save confirmedChildExit:true without exit/close. An IPC error can occur while the owned child remains alive. Independent hermetic negative imports the exact unchanged helper, injects a mock child and emits transport error while alive: exitEvents0/closeEvents0/killCalls0, receiptConfirmedChildExittrue. Contract assertion exits1. No actual child, application or PG executed. This may falsely authorize fixture cleanup while child remains active. Also exit precedes stdio close, so wait genuine close before final output capture.

Required minimal repair: error records failure; it cannot confirm exit/close. Terminate owned child where necessary, retain containment until real close, settle pending RPC queries and drain streams before cleanup/success. Spawn failure must be distinguished honestly. Do not change original producer10s deadline, SQL/role/grants/caps or historical bytes. Original runCompleteInput uses deadline.wait; no unsupported claim that shim alone extends budget.

Two issuer native children and parent remain NOT_RUN. Heavy release held until independent corrected-source review. Cloud previous source-only turn completed+cursor73idle, then one15min source-only lifecycle repair task01a13b76-58db-71d2-bc13-2e352b3d8eb3/cursor74inProgress. Root reports/reviews only, no overlapping edits. Maker may run lightweight isolated lifecycle probes/syntax only, no PG/native/application imports/build. Code/evidence separate, original RED retained.

Main8c58 and all PR370..381 terminal stay unchanged; no production/VPS/DB/role/HTTP/crawl/CI/deploy/cache operations. Full three-stage objective remains active and incomplete.

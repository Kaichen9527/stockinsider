# PR372 exact7af canonical Linux evidence

Source `7af8cba0347010a1d2b007fc8e733ce30faf0ef3`, tree `05065f79c9023135eac56c0522bb44a043e6b843`, web tree `869ad0662b486108c1d74ae3736a1baca6b825e2`. No product/test/lock/workflow changes.

Executed the unchanged `npm run test:source-led-opportunity-v3:product-correctness` once with all original nine files. Node22.14.0, Next16.3.4, pg8.18.0, PG17.11, OS-derived USER; proxy/CA preserved. Root dependency tree reused via local hardlinks from same-lock existing deps, web dependency tree already local hardlinks.

155 total:153 PASS /2 FAIL /0 SKIP, exit1,152.671 seconds. All31 PCR executed:30 PASS /1 FAIL /0 SKIP. PCR-022 PASS. Failure1 PCR-024 original browser command. Failure2 V314-004 original browser command. The pinned Chromium1208 executable is absent; no network/download/alternate browser attempted. Parent tests omit child stdout from error rendering: full child root cause was not recovered and must not be invented from metadata. Preserve raw stderr, parent errors, cache inventory, last-run JSON, and all155 testnames. No failure retry.

Process-group peak sampled757547008B; supplemental active Node/npm/PG sampler (includes reparented PG, started later) peak2115235840B. Resource sampling limitations recorded explicitly. Minimum workspace9268637696B and tmp16454451200B, both above8GiB. Original tests stopped their services; no active owned Node/npm/PG/chrome remains. No deletion needed.

Original canonical browser commands produced an observed `.next` artifact with BUILD_ID `rljBNVoM7HviTv4-GBdt3`,1794 server files. Manifest recorded solely as observed side-effect: no separate normalbuild invocation/exit was captured or claimed, and prior `GEECSVkE4LnJIliZtDUra` is not reused/relabelled.

This evidence does not establish protected/signature/code-review/model/production/strategy approval. PR372 remains frozen; root owns independent review/handoff.

# Failed owned-tmp native delivery

Exactly one new physical-input run: 0 PASS / 2 FAIL (AUO child + parent); EMC NOT_RUN. All 334 frozen runtime inputs unchanged. `financial_parent_invalid` rejects writable `/tmp` ancestor before financial FD acquisition. No fix or retry.

New-run installer COMMIT/repeat-rollback components are retained separately; they do not convert the failed run into a PASS. Whole 16-table snapshots and ledger before prefix/failure match; count 1 / 2,582 bytes and FD 0/0. All finance/author/reviewer packet/result byte measurements are null / NOT_RUN.

Normal finally and independent postrun lstat confirm owned paths removed; six observed backends absent; one PG PID1 RSS0 zombie retained. Original 8GiB disk/RSS guards held in sampled observations, not instantaneous guarantees. All private raw remains local; published witness is maker-derived and not independent/formal approval.

The source seal retains original source-lineage fields and adds this execution identity; execution-identity.json identifies the exact new run and handoff commit. Source-only tests and prior native successes were not rerun or added to counts. See HANDOFF.md in the parent directory for exact limits and pending work.

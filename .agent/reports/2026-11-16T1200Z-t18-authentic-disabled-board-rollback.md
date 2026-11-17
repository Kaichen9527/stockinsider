# Contabo staging backup and rollback rehearsal

The authenticated 2026-09-19 archive was restored in isolated staging. Verification covered 288 foreign keys and 193 row-level security tables.

The original broker accepted only the old release pair. A live run reached `START_A` and returned a rejection after all eight negative HTTP probes passed. The transport tests reproduced that rejection for both launch releases. PR #406 commit `f519b65b689a67f14bada9ecb429783de173c2f4` shares the allowlist with the immutable asset pins. All 13 broker transport tests and the Next.js 16.3.4 production build passed.

On the corrected real archive run, the two fixed Next.js builds executed A → B → A. Terminating B closed the listener and triggered recovery to A. The homepage and static asset returned HTTP 200. The ranking API returned its expected no-store HTTP 503 with `producer_unavailable` and no ranking or detail. Six proxy denials, two direct PostgREST denials and unchanged data fingerprints were verified.

The host retained the release HOLD. Formal signatures matched, the isolated units stopped and both scratch roots were removed. Ranked output and bound stock detail still require a genuine frozen ranking. The code change still requires the independent review evidence and release CI.

[Staging PR #406](https://github.com/Kaichen9527/stockinsider/pull/406)

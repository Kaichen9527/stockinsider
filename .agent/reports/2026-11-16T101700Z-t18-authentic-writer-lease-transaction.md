# T18 staged writer lease and read committed migration rehearsal

2026-11-16 UTC. Engineering source 437beb7bb4ae07a83d5c3f9f83967966e4dcdcd0. The work and Next.js production build used Contabo isolated staging.

Both authenticated 9/19 rehearsal runs retained the 26 committed sealed-archive publication migrations on their isolated clone. The first run captured SQLSTATE 42501 from the exact writer-release fence, rolled back the unauthorised migration attempt, acquired a short lease through the existing RPC as service_role, and passed the legacy migration before the transaction stopped at the provider phase.

The native tests reproduce the absent-release rejection and the leased update with the original fence. The parser now recognises the exact explicit READ COMMITTED outer wrapper when called by a READ COMMITTED transaction. The provider and financial-summary migrations were tested unmodified. Thirty focused tests and the Next.js 16.3.4 production build passed.

The second genuine archive rehearsal returned `VERIFIED_DISABLED` at `state`. The migration sequence recorded legacy, provider, summary.

| Scoped check | Result |
| :-- | :-- |
| archiveIdentityFenceDisarmed | true |
| archivedReleaseRecognized | true |
| leaseAbsentAfterCommit | true |
| leaseAcquired | true |
| leaseFunctionsMatched | true |
| leaseReleased | true |
| localReleaseBinding | true |
| localWriterHeaderCleared | true |
| sameLegacyFailureIsolated | true |
| transactionalLegacyCommitted | true |
| unchangedModeDisabled | true |
| writerFenceStillInstalled | true |

The genuine archive's verified restore counts are 288 foreign keys and 193 RLS tables. No writer-release value or lease owner is exported. The formal service signatures matched in both attempts. The final cleanup verified all staging units inactive and removed 2 working roots.

The restored archive has not completed the latest Next.js rollback. The release HOLD and genuine source/ranking acceptance gates remain.

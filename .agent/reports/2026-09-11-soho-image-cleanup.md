# SOHO exact image archive and cleanup evidence

Date: 2026-09-11 (Asia/Taipei)  
Host: `5.104.83.211`  
Policy commit at execution: `371e0e3` plus the post-delivery identity update in this report's commit

## Outcome

- The final scope contained exactly eight obsolete canary rollback refs. All were
  absent from every container image/config identity, 229 active compose/systemd/
  nginx/cron files, and all process command lines immediately before removal.
- All 13 current refs and 28 retained rollback refs matched their immutable image
  IDs immediately before and after removal.
- The encrypted archive streamed directly from Docker save into the Mac project
  `backup/` AES-256-GCM envelope. No plaintext archive was persisted.
- The archive authenticated and was actually loaded into a clean local Docker
  engine. Every tag, canonical Config SHA-256, platform, RootFS layer list, remote
  image digest and loaded config digest was checked. The locally loaded refs were
  then removed.
- Exact `docker image rm` succeeded for all eight refs. No force, prune, volume,
  container, pull or VPS load operation was used.
- Filesystem free bytes changed from `7,739,486,208` to `10,589,630,464`, an
  observed increase of `2,850,144,256` bytes (2.65 GiB). Concurrent filesystem
  activity means this is an observed host delta, not a per-layer accounting claim.
- Post-check: 27 total containers, 27 running, zero unhealthy/restarting; every
  candidate ref absent; every current/retained digest unchanged.

## Backup evidence

- Archive manifest: `backup/soho-docker-images-87ab3795-c648-40b3-94fb-73fe619a2ea8.manifest.json`
- Encrypted artifact: `backup/soho-docker-images-87ab3795-c648-40b3-94fb-73fe619a2ea8.sib`
- Restore receipt: `backup/soho-docker-image-restore-84f5e3b0-d8de-440d-b180-6897c63aefea.json`
- Manifest SHA-256: `b62198ee1acba1ac8b96e84cf64408e8a50b30af55871338e4625bc5e2aa352b`
- Restore receipt SHA-256: `abfa4ca8b6a1c066be4ea835da907a13a82476aad2bad320f155db573a252da2`
- Authenticated plaintext stream: `837,384,704` bytes,
  SHA-256 `844fb69e206f2a9c29078f5405a13f40091c1e405ff235d3b87bb3ead8076011`
- Ciphertext envelope: `837,384,776` bytes.

## Per-image evidence

The byte values below are Docker image inspect `.Size`. Docker's pre-removal
containerd accounting reported shared/unique data separately, so these values
must not be added to claim reclaimed filesystem bytes.

| Ref | Immutable image ID | Inspect bytes | Layers |
|---|---|---:|---:|
| `soho-rollback/soho-live-canary-api:20260910T220957Z` | `sha256:baf21214fa1d4d37ab480fd89f94debcd1945b3d120d8dffd787d9825e89d81f` | 297,553,026 | 14 |
| `soho-rollback/soho-live-canary-calendar-worker:20260910T220957Z` | `sha256:75b62a7e3288ffe942a6eaea36ab43f022e81c87f0c7d92a22c972bf2a6531d9` | 214,465,755 | 14 |
| `soho-rollback/soho-live-canary-web:20260910T220957Z` | `sha256:58a03c8f802ef6d459b3c1b8e2afa626cce54ce3c4450261f4426682c607e417` | 106,290,363 | 8 |
| `soho-rollback/soho-live-canary-worker:20260910T220957Z` | `sha256:25d30158cc2a755b755973352c550a8b86a5ca63ff60602a2c0bc796199af976` | 214,465,746 | 14 |
| `soho-rollback/soho-live-canary-api:20260910T233603Z` | `sha256:6456d6328cba3355f295818bc99e7f22108998b3d38dfe04f56df1f6de741ad4` | 297,600,901 | 14 |
| `soho-rollback/soho-live-canary-calendar-worker:20260910T233603Z` | `sha256:ec575d45893c157347a5cd0025d8f015845b7e4ac36d226ef2b992dd98c7084b` | 214,486,452 | 14 |
| `soho-rollback/soho-live-canary-web:20260910T233603Z` | `sha256:63064c2dde1cd9382ba21771dd0f30d41ff6995ee6b9368ebd9f94ce8c9aac85` | 106,287,325 | 8 |
| `soho-rollback/soho-live-canary-worker:20260910T233603Z` | `sha256:b920e8be5ef7b3ef4536b93b9021ca761457560159f2cfe38d4ef63cbf3b8503` | 214,486,443 | 14 |

## Fail-closed exceptions

The earlier SOHO deployment process removed three obsolete production image
identities before a verified archive could complete. They are recorded as
`externally_absent_before_verified_archive`; they were not recreated and are not
claimed as backed up. A later deployment also removed three duplicate staging
rollback aliases while their identical image IDs remained protected by the
`20260911T023150Z` aliases. Both facts are immutable audit entries in the policy.

Two failed/interrupted `.partial-*` files remain quarantined in `backup/`. They
have no completion manifest or restore receipt and are not counted as backups.

## Capacity guard state

`stockinsider-taiwan-data-queue-drain.timer` was disabled and stopped when host
free space crossed below 15 GiB. The web service and parser socket were not
stopped. It remains `disabled`/`inactive`; it may be restored with
`systemctl enable --now stockinsider-taiwan-data-queue-drain.timer` only after
the database/restore peak is complete and the reserve policy passes again.

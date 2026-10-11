# Research runtime dependency packaging

Scope: release packaging only. The AUO/EMC working articles remain incomplete demonstration research; this change confers no publication, thesis qualification, strategy approval or historical signal authority.

The standalone build traces did not include the repository-relative research inputs read by the financial adapter and read-only working-draft loader. Both packagers now copy the exact checked-in `deployment/vps/research-runtime-files-v1.json` inventory: 20 files, 907,264 bytes. No whole repository, original PDF, database, raw acceptance logs, backup or secret is added. Existing persistent stock history and research evidence are unaffected.

The artifact root follows the existing readers' `cwd/..` convention. A current `app/server.js` release gets `docs/research` at release root; a nested `app/web/server.js` gets it under `app`. The legacy `web/server.js` package also gets release-root research files. This does not change service working directories or make the legacy package compatible with the current service unit.

All source pins must pass bounded regular-file, no-symlink, byte-length and SHA-256 verification before any research files are created. Output cannot escape the release tree, traverse symlink parents or overwrite existing files. The current standalone release manifest includes copied research files, so post-packaging alterations fail release verification. A feature-enabled source cannot silently omit the inventory; historical minimal fixtures without the feature continue unchanged.

Acceptance: actual AUO and EMC financial readers and working-draft loaders read the copied inputs in three supported layouts; missing/altered/symlinked files, duplicate/traversal paths, output redirection, overwrite and missing inventory fail. A complete minimal standalone package includes all 20 pins in its manifest and rejects tampered research content. This is offline packaging acceptance, not a production deployment or a native publication pass.

No web source changed in this slice. The separately recorded normal Next build at runtime repair `1490472ec21630142222db86652d28772ddb45c9` has the identical web tree; it is reused only as web compilation evidence. The packaging tests are run against this slice itself. The independent native VM run and protected full-range review remain separate gates.

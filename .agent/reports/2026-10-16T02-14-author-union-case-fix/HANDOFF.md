# Author union CASE delimiter repair — SOURCE ONLY

Taipei 2026-10-16 02:14 task start. Base `14a225fbb2328b2cbfd044201dd47ecc343087a9`; source `c08b1591f27522748c2f2a8b1ebadc128f857d77`; tree `055dad063e32f2fda73547bd2b78151159a2c4fa`.

Exactly three CASE expressions in the IF predicates were enclosed in parentheses: SQL lines280–282,395,396. All CASE arms, null semantics, outer comparisons and WHEN/ELSE values are preserved. The eight prior explicit ARRAY selections remain exact. No namespace/catalog CASE or other expression changed.

Two prosrc hashes necessarily changed; each is updated once in the SQL postcondition and once in the source-derived profile:

- read_research_author_result_v2: `e5889572355ba71c77f0d12c5af867cf65e88d00161d781bbd5051e43f674233` → `d3ca7e0e39022052866e7837bd5232198bf6cd8f40992d0c69cc54558e20cfd9`.
- receive_research_author_result_v2: `97f361883edc0d8cf61e696775c7cdb377272979c61e2604c3ec881497576c41` → `3889869f27b2761b166621ee1d4ce13ae3948488bca2c5a65783a6448008b52d`.

New SQL SHA256 `18b0e4814410601ab8b254f274a7fe085230b922656038cc1f8fe2539c056f76`; profile SHA256 `19526e0199a406857de4c9869afd3cb243f74603ee960f06bc5e812c5d291243`. Reverse only those three parenthesis pairs and four hash-field edits yields both original files byte-for-byte. All six predecessor body hashes, cb22/4afc, other two successor hashes, schema/profile/query sources, function metadata/ACL/default/role checks, locks/limits/timeouts/complete postconditions and original v2 receive arm remain unchanged. Of289 prior inputs,287 are byte-identical and only these two owned files changed. Native harness/callback/fixture unchanged.

Actual Node22.14 command: `node --test scripts/research-v3-author-union-sql.test.mjs`: **6PASS /0FAIL /0CANCEL /0SKIP /0TODO**. This is the unchanged static source suite, not PG grammar or native proof. Sampled session peak RSS57561088bytes; minimum workspace8594038784 and tmp15213142016 >=8589934592. No PG/scratch/native/app/build/npm/install/network/CI/PR/ref/deploy/cache operations.

Original native REDs remain immutable: 79fd/0a0/d8de receipt f0350019b92b305bb41b4f6a99562716207f3429454b6859c4139e6a22c90e7a (42883); repaired c38/14a receipt1e8254c30d14fe879b68148c8fcc834dd61f743fa132bf47138a5b0fb496148a (42601,0PASS2FAIL). The latter reached only the third replacement, not first COMMIT. The two receive CASE sites were source risks, not separate native failures. Prior rollback/2backends absent/cluster removed/shutdown and RSS0 zombie remain scoped historical evidence. Root has not inspected the29 private raw contents; this repair makes no contrary claim.

Pending Root exact review and separately authorized changed-input native. No PG was run here and no installer/lifecycle approval is claimed. Both issuer author flows, legacy77/compatible-v2, ACL/drift/busy/rollback/response-loss negatives, four callers/reviewer/Q-R/atomic publication/whole closure and both formal articles remain pending. Do not auto-start native from this handoff. Maker does not independently approve its work; DD consumed deployment is untouched.

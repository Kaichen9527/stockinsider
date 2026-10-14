# Official document lease isolation

Root cause confirmed in exact deployed169/currentmain3e route and Contabo SQL: private-artifact receipt registration requires a production-data-plane lease, while upload/worker do not acquire it. Same-release identity activation does not acquire a lease. Original main route tests3PASS5FAIL are preserved; exact prior maker3953 route/test copies give8PASS0FAIL and fresh ordinary GHA8PASS0FAIL. This is synthetic boundary engineering acceptance; production pending jobs/facts remain unchanged.

PR378 is draft, attached, head18b1/base3e. Fresh product diagnostics, genuine exact evidence and normal protected gates remain pending; initial protected missing-ref RED is retained and no rerun occurred. No runtime helper/SQL/schema/roles/credentials/policy mutation, no production API/DB write or retry, no Mac build. Old PR303 whole branch is not merged.

Root code inspection covers auth before lease; invalid/busy/unavailable no mutation; acquired UUID-only release; artifact/receipt/job/worker inside try/finally; unchanged parser, writer and DB fences; read-only GET; explicit rejection/partial outputs; new contents-read/no-secret ordinary workflow uses existing pinned actions. A copied historical review label is not a fresh formal approval. Shared helper cleanup/TTL semantics are inherited; no new global lease-recovery behavior is introduced.

Status: DONE_WITH_CONCERNS for isolated repair; fresh full CI/protected/deployment/real facts remain open.

# Isolated v3 cash citation consumer proof

Base f75edee46f9c453e5a09306faf00cef2bd67cb82; frozen consumer 92870dc20828fd74f86f2681281a92bff2d9c2e3 and protocol d33d6328763ee2591a41d849ff4bfadf75c2ff2e.

Only the new `research-v3-cash-citation-native.test.mjs` entry executes. Two sequential company children use the existing legal fixture helper; no old test entry is imported. The source snapshot/withdrawal helpers are narrowly copied unchanged from the existing withdrawal entry, not its test registrations.

Each case performs a genuine v3 first seal (AUO9/EMC7 files), independent read-only observer confirmation, actual citation-consumer DB READ and recomputation, wrong revision/hash and citation rejection, missing-owned-root READ and existing seal replay, then a distinct service-role connection commits one source rights withdrawal under its own write lease. A fresh consumer READ must return exact P0001 source_seal_invalidated_or_missing. Full ledger and nine-table snapshots distinguish intentional source/event/invalidation changes from prohibited mutations.

Raw payloads, request owners and source URLs remain private in /tmp/v3-citation-native-o15. Only public-safe hashes/counts/charges/FD order and cleanup witnesses are published. Hs is the existing partial four-source engineering identity; Hc is the actual native Node executor, not compiled Next or approved whole closure. Captured inactive-production-release behavior does not prove a formal active writer or peer. Synthetic roster/source/registered binding are local fixtures, not formal rights or article qualification. Cached citation sets are not live leases.

At this source seal, execution is NOT_RUN. The separate evidence commit records actual results and any original RED. No production source, SQL, schema, ACL, budgets, runtime or existing tests are changed. Four callers, actual article validator, Q/R, review-pack/publication union, whole S-C-B-Q-R-A and formal author/reviewer/source/reservation/publication remain pending.

# PR #384 — Native preparation preflight TimeZone mismatch

The original quality job recorded a redacted assertion with message digest `52c7cc08ab309eda6015c8991ffeedae7a5318ef3d8a3179bb2f016dea56d8aa` from the preparation HTTP preflight. The sanitized TAP reported zero named witnesses. The artifact list returned zero available artifacts, and the original TAP archive ID returned HTTP 404. The log specifies seven-day retention.

A non-root, offline Node v22.23.1 diagnostic hashed 139 public synthetic assertion errors. The historical CI digest matched the expected predecessor array plus `TimeZone=UTC` directly after `search_path`. The old fixture used the same expected array for the `vnext_target_current_v1` and `vnext_target_quote_v1` checks. Only the exact quote constructor declares `timezone='UTC'`.

In an empty isolated PostgreSQL 17.11 cluster on Contabo, the exact three declaration headers with trivial bodies produced the following `pg_proc.proconfig` result. The host binary was the Ubuntu package, distinct from the original hosted job's pinned Debian image.

| Routine | Original profile | Updated profile |
| --- | --- | --- |
| `vnext_target_current_v1` | Match | Match |
| `vnext_read_v1` | Match | Match |
| `vnext_target_quote_v1` | Rejected | Match |

The existing source correction `c5b0c3ce5086156b24ad1f3588e5159052de2559` adds `TimeZone=UTC` to the quote predicate and profile, and checks the per-function declaration. The continuation at `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43` carries that correction. PR #384's current head is still `cbb581662e72942610ff85b0bf5e7e47ddddfa46`.

The original prep job ran on October 24 Asia/Taipei, a Saturday. The fixture still has an unconditional weekday assertion after its separate closed-day fiscal case. That is another obstacle to a full HTTP rerun on a weekend. The explicit weekday assertion generates a different message digest and boolean operands, so it does not explain this observed failure. Preserve the actual closed-day fiscal check and run the full case with real weekday authority, with separate named phase diagnostics. The two real market-close sessions remain their own acceptance requirement.

The catalog probe covers the configuration arrays only. Full PostgreSQL install, the actual HTTP loss/recovery scenario, all-active thesis and the protected final-head review remain open. The isolated native probe contacted no production socket and ran no product migration.

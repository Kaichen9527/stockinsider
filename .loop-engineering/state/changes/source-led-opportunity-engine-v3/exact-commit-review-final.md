# Exact implementation review — Ubuntu PostgreSQL restore defaults

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `7496f05efea1d6d3918ac6ad365ac02c7a21203c` / `07df5d074d4ff1b8371ae21cc2a380e78462aa99`
- Full final range: `3c28c7b6158d95c31194900d7afda538211949c7..7496f05efea1d6d3918ac6ad365ac02c7a21203c`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Review result

- Reviewed the complete four-file repair against the current protected `main`; the change is limited to two production shell fixes and their exact contract assertions.
- The PostgreSQL preparation now creates the named cluster's `conf.d` directory with root/postgres ownership before installing the already reviewed socket-only configuration. It does not start, enable, replace, or expose the cluster.
- The staged restore now creates its `C`-locale database from `template0`, avoiding Ubuntu 24.04's `C.UTF-8` template incompatibility while preserving UTF-8 encoding and the existing fail-closed staging flow.
- The first live attempts stopped before any application data was restored or traffic was switched: one at the missing configuration directory and one at PostgreSQL locale validation. No partial StockInsider database remains.
- Contabo data-plane contract tests passed 29/29, the exact product-correctness suite passed 151/151, the V3 browser suite passed 9/9, and the production Web build passed.
- The active V3 product graph is unchanged. No migration, data model, authorization, credential, network-listener, source-ranking, valuation or public-decision behavior is modified.
- No secrets, plaintext credentials, database rows or connection strings are committed or emitted. The protected ruleset remains active and this evidence does not itself merge, deploy, restore data, activate PostgREST, switch Web traffic or cancel Supabase.
- No unresolved P0, P1 or P2 finding remains.

# Exact implementation review — exchange multiples and TPEx TLS chain

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `299707cd4ede3711f061bafbd7ee2460260cb21d` / `4e46f080e83325f00d19b99af4df78190dfed25d`
- Full final range: `0dd35226c2691407a0f2f5e4a72948a17c6e4f10..299707cd4ede3711f061bafbd7ee2460260cb21d`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Review result

- A rollback-only production transaction reproduced the valuation failure exactly: TWSE's `-` unavailable-PE marker reached a numeric cast and aborted all 1,080 official rows. The provider now converts only non-numeric absence markers to JSON null in both named and positional fields, retaining an independently valid companion multiple.
- TPEx object rows use the same numeric normalization. Rows with neither PE nor PB stay excluded; no missing multiple is invented or promoted.
- Production TLS inspection found that the TPEx edge served a leaf certificate without its named TWCA SSL intermediate. TLS verification remains mandatory. The deployment repair downloads that public intermediate from its HTTPS AIA host, pins its SHA-256 fingerprint, verifies it against the system root store, installs only that certificate, and performs a verified TPEx canary.
- The script never uses `--insecure`, does not replace the root bundle, and is invoked only after the standard CA package is installed during initial Contabo preparation. The live production host now reports OpenSSL verify code zero and both TPEx endpoints return verified HTTP 200 responses.
- Provider tests passed 17/17 and the CA contract passed 1/1. Bash syntax, TypeScript, lint with zero errors, and the full production build passed.
- No credential, source authority, database role, classification threshold, writer lease or scheduler ownership changed. No unresolved P0, P1 or P2 finding remains.

## Production boundary

This review authorizes only the unavailable-multiple normalization and pinned TPEx intermediate installation after protected checks pass and normal merge. Ruleset `20177392` remains enabled.

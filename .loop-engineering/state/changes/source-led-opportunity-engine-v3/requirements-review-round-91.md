# StockInsider V3.11.1 — Requirements Gate Round 91

## Result

`CHANGES_REQUIRED` — `P0=0 P1=1 P2=0`

This was an independent fresh Requirements review of the final Round 90 evidence
candidate at subject commit `86191c8392fa41292f5877db2580be28f215d66b` and tree
`d17e652f5bc4f2de10fac92b48fec864c9f03467`. The live GitHub root/ruleset was checked
separately in authenticated Settings before this review; the browser evidence is
recorded in `requirements-round-90-repair.md` and is not treated as a source-tree
claim. Architecture Round 10 remains locked.

## Closed Round 90 blocker

The protected external trust root is now externally observable:

- bootstrap run `30692927942` and artifact `8816290195` succeeded;
- artifact digest is
  `sha256:49bc6603ecc4c978651c570665de76281838fe45bbefd21d54dc0eb9cce2d0f1`;
- GitHub Ruleset `20177392` is `stockinsider-v3-gate-root`, `Active`, targets `main`,
  requires a pull request, requires up-to-date status checks, and requires the exact
  `stockinsider-v3-gate-root` GitHub Actions check with no bypass.

This closes the server-side P1-1 prerequisite from Round 90. It does not itself grant
Requirements or Architecture PASS.

## Finding

### P1-1 — Reviewed model-runner host pin no longer matches the executing Codex binary

The active `model-runner-host-pins-v3.4.json` and
`host-pin-compatibility-amendment.md` intentionally bind the reviewed executable to
`codex-cli 0.146.0-alpha.3.1`, its reviewed SHA-256 and its reviewed filesystem
identity. The current host now reports:

```text
fixture expected: codex-cli 0.146.0-alpha.3.1
actual:           codex-cli 0.146.0-alpha.9.2
actual path:      /Applications/ChatGPT.app/Contents/Resources/codex
```

The exact model-runner command returned `12/15` with three `ROUTING_BLOCKED` failures
at `verifyCurrentNode`/`probePermissions` because the reviewed host preflight rejected
the changed Codex binary. `v3:doctor -- --expect-mode disabled --require-host-pin
model-runner-host-pins-v3.4` independently returned `status: fail`,
`reason: host_preflight_rejected`; deployment remained `disabled`.

This is a real host identity drift, not a test skip. Silently rewriting the pin to the
new binary would change a security-critical reviewed authority and would also violate
the prior requested fixed-version amendment. Repair must either restore the exact
reviewed Codex `0.146.0-alpha.3.1` binary or create a separately reviewed compatibility
amendment with fresh signed binary/stat/hash evidence and rerun the model-runner gate.
Until then the model-runner track cannot be a fresh PASS.

## Independent evidence

| Check | Result |
| --- | --- |
| `npm run test:source-led-opportunity-v3` | PASS — 53/53 |
| `npm run test:source-led-opportunity-v3:migration` | PASS — 20/20 |
| `npm run test:model-runner-v3` | `CHANGES_REQUIRED` — 12/15; 3 host-preflight failures |
| `npm run v3:doctor -- --expect-mode disabled --require-host-pin model-runner-host-pins-v3.4` | FAIL — `host_preflight_rejected`; deployment disabled |
| protected GitHub check/ruleset | PASS as external prerequisite; not a code Requirements PASS |
| `git diff --check` | PASS |

The ordinary PCR command remains intentionally RED because the V3.11 runtime is not
implemented yet. It is not used as a false Requirements PASS; PCR baseline ownership
continues through the protected trace contract. No production database, runtime,
scheduler, flag, migration, deployment, merge or push was performed.

## Required next step

Repair the host-pin drift in a new immutable tree without weakening the exact pin
contract. Then return to **Sol XHigh** for independent fresh Requirements Round 92.
Only `P0=0 P1=0` may unlock Architecture Round 10.

# Local validation, 2026-10-05

Implementation source is on the isolated
`codex/astra-recovery-installer-proposal-20261005` branch. Recovery subject stays
`e94d21f9fe05dc436211a2458ea59adb52195e26`; existing approved active artifacts,
packet verifier, workflows and runtime pins were not changed.

Actual local checks:

- Node 22.23.3: 46 tests passed, zero failures/skips: 15 new installer proposal
  tests, 15 unchanged packet tests and 16 protected-worker regression tests.
- `npm --prefix web run build` passed, including TypeScript and 91 static pages.
- `git diff --check` passed.
- New dry-run output reconstructed from exact frozen facts: 4,657 bytes,
  SHA-256 `483028104040e76817df13c37ba9d81195bdd4922a478e6c648d94abe26631e8`.
  External artifact path:
  `/Users/kaerchen/.cache/stockinsider-workspaces/recovery-installer-dry-run-20261005.json`.
  Output lists 24 absent deployment fields, eight external evidence obligations,
  and six ordered operations. Activation and protected gate flags are false.

Tests use ephemeral synthetic Ed25519 keys and synthetic protocol/path/permission
observations. They do not prove a real authority, durable CAS, correct installation
permissions, installed control plane, live model oracle or passing protected gate.
No actual adapter was invoked or installed; no production state or secrets changed.

Independent exact-commit review is pending. These are implementation test results,
not independent approval evidence or a signed recovery packet. The later commit
identity is handed off separately to avoid embedding its own hash in its tree.

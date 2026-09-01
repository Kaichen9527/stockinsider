# Exact implementation review — signed-host compatibility bootstrap

Date: 2026-09-02

Review authority: read-only exact review of the immutable protected-gate
bootstrap commit. The change updates the closed Codex signed-host fixture to
the installed `0.151.0-alpha.7.2` binary, registers the independently reviewed
active graph, and delegates host-dependent acceptance variants to the
base-owned trusted oracle. It changes no product source connector, database,
scheduler, public API, valuation rule, Shadow rule or deployment authority.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `66550cb540d9e1ee657d7dcd54fc9dbeb52fc5b8` / `b4765af2955a63f055b5237b0ad7dc9742c6b655`
- Full final range: `9add16e5b2144613f237fa7246e5be323dbc838d..66550cb540d9e1ee657d7dcd54fc9dbeb52fc5b8`
- Active graph: `81dceab0d17b6c0f0c104ee3376f6d1dc5065a283040a4c1ee0ac40f574580d4`

## Review result

- The host fixture is canonical LF-terminated JSON and binds the exact Codex
  executable SHA-256, executable and application CDHashes, byte sizes, inode
  metadata, Team ID, bundle identifier, runner identity and version string.
- The runner and doctor accept only `model-runner-host-pins-v3.14`; v3.13 is
  not retained as a permissive fallback.
- The graph mapping is closed over the exact active graph and immutable
  Requirements and Architecture evidence refs reviewed before this subject.
- MR3-010, MR3-011 and MR3-019 follow the protected-live-oracle split:
  candidate execution proves static ownership and the protected host owns the
  signed-host result.
- The candidate cannot choose model, review ref, graph digest, executable,
  sandbox, credential path or host-oracle result at runtime.
- Exact local signed-host model-runner tests passed 21/21; protected static
  trace passed 28/28; worker tests, syntax validation and `git diff --check`
  passed.
- Exact-subject product correctness passed 150/150 with stdout SHA-256
  `e172cde759abd75850a564b8b98c5ac330a316d84de0561b0364315afc55b968`.

## Bootstrap necessity and closure

The pre-change protected base is pinned to a Codex binary no longer installed
on its self-hosted runner, so its live oracle necessarily fails before it can
approve any candidate. This exact compatibility bootstrap repairs that closed
trust root; subsequent feature work must pass the ordinary protected gate on
the new base.

No P0, P1 or P2 finding remains. This review authorizes only the compatibility
bootstrap merge. It does not authorize production migration, deployment,
runtime activation or any prohibited action.

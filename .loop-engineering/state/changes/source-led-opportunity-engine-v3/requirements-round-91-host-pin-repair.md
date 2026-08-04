# StockInsider V3.11.1 — Round 91 Host-Pin Repair

## Result

The Round 91 P1 host-identity drift is repaired in immutable implementation
commit `d24bd88f0715de77bbabcc72c26dd02a65a19f41`, tree
`51c55919b6e57ee82f41a70d740dbf4930705c39`, with parent
`9dad5cf966682e1695d98e968671eb40673854cb`.

This is a repair candidate only. It does **not** claim Requirements PASS,
Architecture PASS, Code Gate PASS, runtime installation, PR creation, push,
deployment, migration, scheduler/flag activation, or production mutation.

## Exact compatibility amendment

The tracked fixture is advanced to `model-runner-host-pins-v3.5` and the active
amendment to `model-runner-host-pin-amendment-v3.5`. It is an exact pin for the
currently installed signed binary, not a range or fallback:

- executable: `/Applications/ChatGPT.app/Contents/Resources/codex`
- version: `codex-cli 0.146.0-alpha.9.2`
- executable SHA-256:
  `d96ae1ca1ff6fc8587842fa04c92d3ee4d31651a811c2f89b65fcfd9c28473e2`
- executable stat: device `16777234`, inode `73873972`, size `270605984`,
  uid `501`, gid `20`, mode `100755`
- executable CodeDirectory SHA-256:
  `dce9780d114a670768798d0dc0de4a96b422c309379e17ef14e2404e08dea2fd`
- ChatGPT bundle inode `73872808`, CodeDirectory SHA-256:
  `9f7d645ec76f3543f788f58b1039b9069201fca29133efb7621cd14d6011c5d8`
- Team ID: `2DC432GLL2`; designated requirements and notarized Developer ID
  assessment remain exact fixture members.

The canonical pre-LF fixture remains 2,137 UTF-8 bytes; its SHA-256 is
`6d038608c9084e1b6d8acc4c4709c48a2140a1f967aa94e8fde9df853ec8902b`.
The 18-member runner identity remains 884 bytes and now hashes to
`e3947ead4c5079109c08ba8be6f1e3f93cbecb0dc5d752cd34c973958ef6f480`.

No behavioral model-runner protocol changed: the owner stays
`model-runner-v3.6`, while routing, permissions, prompt, manifest, journal and
trusted-apply protocols remain v3.5. Any later executable, stat, hash, signing,
notarization or fixture mismatch still fails closed with no fallback.

## Synchronized graph and verification

- active artifact graph: 48 files / 38 owners, SHA-256
  `1f0e859b0d925c3d7641224023c8aef3efa4a8171eebe0eadcb3dd49068593e9`
- frozen 14-row script catalog SHA-256:
  `c86ecb71c886882708f62b7ae74e559d0f35d4b56f7202c2725078f09ff82e4d`
- `npm run test:source-led-opportunity-v3`: PASS, 53/53
- `npm run test:model-runner-v3`: PASS, 15/15
- `npm run v3:doctor -- --expect-mode disabled --require-host-pin
  model-runner-host-pins-v3.5`: PASS; host preflight passes and deployment is
  `disabled`
- protected-harness-shaped `GOV-001` and `GOV-004` traceability execution:
  PASS, 2/2
- `git diff --check`: PASS

The earlier dirty-worktree `gate-evidence` discrepancy was an expected reviewed-tree
mismatch during editing; it was rerun from the clean immutable repair commit and
passed as part of the 53/53 product suite. No result was treated as evidence before
that clean rerun.

## Required next step

Run independent **Sol XHigh** Fresh Requirements Round 92 against a new immutable
candidate that contains this repair evidence. Only `P0=0`, `P1=0` unlocks
Architecture Round 10. Evaluation governance remains separately
`blocked/non_fabricated_elapsed_cohorts_unavailable`; it has neither been altered nor
used as a substitute for product evidence.

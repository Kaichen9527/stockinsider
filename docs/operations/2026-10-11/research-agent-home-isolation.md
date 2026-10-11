# Research test fixture isolation

The ordinary CI run `38130038830` at source
`2e078dfdd74272d3d50dffdd4cc6c14df3152c78` reported
`financial_parent_replaced`. Its historical ancestor change has not been
identified. The existing release artifact test creates and removes fixtures in
the OS account's home directory. When a checkout is under that home, concurrent
financial readers capture the same ancestor's namespace metadata.

`test:research-agents` now finishes its original parallel group before running
the unchanged release artifact file in a second Node22 invocation. Every
original test file and glob remains present; the new script isolation tests
check the sequencing and unchanged fourteen approved script catalog values.
The approved catalog does not include `test:research-agents`.

A bounded Linux probe used original AUO pinned inputs and the unchanged reader's
checkpoint. Running the actual release artifact test while the reader was
paused changed the home ancestor's mtime/ctime with the same dev/inode, and the
reader rejected with `financial_parent_replaced`. Writing inside an already
existing sibling directory preserved that ancestor and succeeded. Reading
after the release artifact child had finished also succeeded. These controlled
observations establish this fixture's interference mechanism, not the identity
of the writer in the historical CI failure. The VM checkout is under
`/workspace`, outside `/home/agent`, so a passing VM suite alone cannot establish
the original CI cause.

No financial reader guard, fixture assertion, input hash, production SQL,
approved acceptance expectation, role budget or release authority changes.
Engineering tests remain synthetic and do not constitute independent review,
model execution, protected approval or deployment.

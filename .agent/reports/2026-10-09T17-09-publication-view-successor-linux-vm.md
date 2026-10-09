# Publication view successor Linux acceptance — RED

Original847d evidence is unchanged at `b1c56ed06d8649de22a4f4c04c80ef0f9ec6397c`. Root commits27f13e51 +df514965 were cherry-picked before any successor test; local clean source `65bcd5f5327126b9078cbf7aa2de63547b0306b5`, tree `67a6eb40339d209034ceb0b2b05f0a6e90433604`, web `8964c23adc391ece9d8db7b6eebd09493e26bcff`, all runtime/tests equal upstreamdf.

Exactly one original CI on this successor:760 total/756 pass/2 fail/2 explicit native-profile skips. Seven view/SSR cases pass; same reader-before-publication NULL rendering mismatch and its dependent parent fail. Positive reader/corruption cases are not reached, so the corruption delta has not been positively exercised. Types pass; lint0 errors/33existing warnings.

No successor VM build: root explicitly instructed against retrying the bind EPERM and is providing separately scoped Mac normal build. No Linux BUILD_ID or compiled manifest can be claimed. Original build high-level trace has no syscall/address/port; a later standalone127.0.0.1:56957 bind succeeds but does not identify that worker failure.

All raw logs/commands/time/resources/SHA are in the JSON. Failed PG cluster stopped and retained, no owned process remains. Only old failed generated `.next` was retired after original evidence push and exact71-file inventory; no source/evidence/model/private raw inputs removed. This is bounded manual engineering with synthetic fixtures, no actualmodels/publication/strategy/production/merge/deployment.

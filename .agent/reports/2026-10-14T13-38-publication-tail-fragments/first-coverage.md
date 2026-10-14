# Source-derived fragment coverage

Each row links exact original source lines and SHA in the fixture. Native TAP 53 includes parent + financial50 setup +49 matrix controls +2 actual-helper controls, not53 independent fragment effects.

| Fragment | Classification | Dependency-only originals |
|---|---|---|
| p2-L3 | covered-independent-original-fragment |  |
| p2-L16 | not-causally-isolatable | p2-L3 |
| p2-L22 | covered-independent-original-fragment |  |
| p2-L36 | not-causally-isolatable | p2-L22 |
| p2-L42 | covered-independent-original-fragment |  |
| p2-L58 | not-causally-isolatable | p2-L42 |
| p2-L60 | not-causally-isolatable | p2-L42 |
| p2-L63 | not-causally-isolatable | p2-L42 |
| p2-L77 | not-causally-isolatable | p2-L42, p2-L63 |
| p2-L98 | not-causally-isolatable | p2-L42 |
| p2-L147 | covered-independent-original-fragment |  |
| p2-L196 | covered-independent-original-fragment |  |
| p2-L207 | not-causally-isolatable | p2-L196 |
| p2-L213 | covered-independent-original-fragment |  |
| p2-L219 | not-causally-isolatable | p2-L196 |
| p2-L245 | not-causally-isolatable | p2-L196, p2-L207 |
| p2-L281 | not-causally-isolatable | p2-L3 |
| p2-L294 | not-causally-isolatable | p2-L3 |
| p2-L334 | covered-independent-original-fragment |  |
| p2-L346 | not-causally-isolatable | p2-L334 |
| p2-L347 | not-causally-isolatable | p2-L334 |
| p2-L374 | covered-independent-original-fragment |  |
| p2-L385 | not-causally-isolatable | p2-L374 |
| p2-L386 | not-causally-isolatable | p2-L374 |
| p2-L387 | not-causally-isolatable | p2-L374 |
| p2-L416 | covered-independent-original-fragment |  |
| p2-L456 | covered-independent-original-fragment |  |
| p2-L472 | not-causally-isolatable | p2-L334 |
| p2-L477 | covered-independent-original-fragment |  |
| p3-L3 | not-causally-isolatable | p2-L3 |
| p3-L22 | not-causally-isolatable | p2-L3, p3-L3 |
| p3-L29 | not-causally-isolatable | p2-L3, p3-L3 |
| p3-L32 | not-causally-isolatable | p2-L22, p2-L196 |
| p3-L37 | not-causally-isolatable | p2-L3, p3-L3 |
| p3-L54 | not-causally-isolatable | p2-L3, p3-L3, p2-L196 |
| p3-L97 | covered-independent-original-fragment |  |
| p3-L100 | not-causally-isolatable | p3-L97 |
| p3-L105 | not-causally-isolatable | p2-L3, p3-L3 |
| p3-L109 | not-causally-isolatable | p2-L3, p3-L3 |
| p3-L122 | not-causally-isolatable | p2-L3 |
| p3-L165 | not-causally-isolatable | p2-L3, p3-L3 |
| p3-L210 | not-causally-isolatable | p2-L3, p3-L3 |
| p3-L271 | covered-independent-original-fragment |  |
| p3-L280 | not-causally-isolatable | p2-L3, p3-L3 |
| p3-L326 | not-causally-isolatable | p2-L3, p3-L3 |
| p4-L5 | not-causally-isolatable | p2-L42, p2-L63 |
| p4-L30 | not-causally-isolatable | p2-L42, p2-L63 |
| p5-L4 | not-causally-isolatable | p2-L196, p2-L207 |
| p5-L22 | not-causally-isolatable | p2-L196, p2-L207, p5-L4 |

Prerequisite2:11 independent /18 nonisolatable. Prerequisite3:2 independent /14 nonisolatable. Prerequisite4:0 independent /2 nonisolatable. Prerequisite5:0 independent /2 nonisolatable.

67 ancillary source statements are inventoried separately in coverage-summary.json; they were not injected or claimed as native isolated cases. RLS/ACL/trigger/UPDATE/constraint-upgrade statements depending on newly created parents do not create independent causal coverage here. No standalone CREATE TYPE exists; table-created composite/array types are included by exact table creation and namespace fingerprint.

Six exact original function creations have body SHA/security/owner/config observations. Their deferred bodies are not invoked. Source has no ALTER FUNCTION OWNER/SET config fragment in prerequisites2–5; no counterfactual owner/config DDL was fabricated. Earlier guard drift tests remain historical evidence, not new counts.

Known causal non-applicability is not runtime failure or a skipped test. Target fragments for36 controls were never executed; missing independent positive isolation for these targets remains explicit. No new setup RED occurred. All old RED remains in5aad and earlier sealed references.

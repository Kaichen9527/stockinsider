# Financial chain review literal uniqueness repair

Parent: `8fc10fe1edf970abfb9b73fc38e2c4b0d8d1fcaf` (PR376). Original successful ordinary/product CI and the missing exact-review protected failure remain historical evidence, not successor approval.

The old `assertFinancialReviewBinding` counted only fully correct literals, ignoring additional same-prefix wrong-hash or indented rows. The expanded original pure case reproduces `correct then conflicting` as Missing expected exception, with 37 PASS/1 FAIL across the original six suites.

The minimal guard now gathers every row whose `trimStart().startsWith` matches the fixed prefix, then requires exactly one row equal to the unindented prefix plus the valid 64-character hash. This matches the existing profile/operator literal treatment. It retains hash validation and the existing failure code. Tests cover both conflicting orders, indented duplicate/conflicting orders, duplicate correct, wrong-only, missing, base-only, indented-only and trailing-space-only rejection; one exact literal with LF or CRLF remains accepted. Matrix assertions remain inside the original case, preserving the six-suite test count.

Only the guard, its test and this handoff change. SQL, default48/financial49/profile50 constants and hashes, catalog, operator/HBA, authority, pins and workflows are unchanged. No attestation, exact-review ref or maker approval is generated.

The guard is a changed transitive captured-native input: the prior 74-file equality record and prior 28/1/4 CI must not be asserted for this successor. This increment records fresh native results if executed; otherwise they remain pending the new-head ordinary workflow. Formal peer/operator transport, production authority, capacity and deployment remain outside this local engineering repair.

# Pre-dispatch source finding

Source d87d718 was not native-tested or dispatched at this evidence seal. Local
review found that its pair comparison used the existing material inputHash,
which intentionally omits fetchedAt/collectedAt/retrievedAt/evaluatedAt keys.
A new unknown timing key on an evidence/parsed object could therefore be ignored
by that comparison. Existing passing contracts did not cover this case. This is
a source-only closed-shape gap, not an observed DB insertion or production flaw.
The next source commit must compare the complete reconstructed objects exactly
and add ignored-key negatives before ordinary CI dispatch. This initial receipt
and source are retained as historical WIP; do not treat them as final acceptance.

# Implemented candidate, not a protected-base activation

The source in this branch now implements the frozen v3.19 native identity and
stricter operation-parent/transport-denial profile. This is a candidate branch;
protected main, worker successor registration, required checks and credentials
remain unchanged. The original proposal receipts describe their historical
measurement state; their `active_fixture_modified=false` is not a claim that
this later implementation contains no candidate fixture edit.

## Actual changed behavior

The fixed native path/hash/signature/stat and fixture length/digest are updated
from the independently measured proposal, never learned at runtime. Node/Git
pins and signing requirements are unchanged. The profile builder requires three
distinct canonical absolute sibling roots and a non-root operation parent;
it rejects overlap, control characters and path traversal and safely escapes
TOML keys. Explicit deny rules close the private parent and transport before
reopening only source read and scratch write. Its sole production caller passes
all three roots. Existing negative tests remain; eight focused regressions were
added. Permission profile v3.6 has a separate fixed 885-byte runner identity
5ff9c6404c0c645e4845784923190195fe1fd5eb53dfef2be57c23e79e0fad64.

## Validation actually performed

27 noncredential Node tests passed using the existing documented private
candidate-policy and candidate-scratch environment. Earlier attempts without
those required private paths were correctly rejected and are retained, not
counted as passes. Full live model/credential checks are not claimed.

The reusable `scripts/opportunity-v3/host-compatibility-canary.py` uses the real
candidate profile builder and sanitized-environment function, not a handwritten
policy. Nine real native sandbox checks pass, with bound config hashes, actual
commands and OS denial output, synthetic credential-shaped files only, and a
working loopback positive control. Adapter/script/fixture hashes and config
bytes bind the outcome. Every synthetic source file remains intact.

The candidate's production web build passed. Standalone protected traceability
correctly rejected a missing external-harness marker; the marker was not forged
and the rejection is retained. GitHub diagnostic CI and the genuine five-part
protected gate are separate checks, not inferred from local test success.

## Review and activation boundaries

Initial independent proposal reviews found receipt provenance defects; fresh
exact-argv/plist and fully bound policy receipts addressed them. One later
native comment recorded acceptance against an unresolvable head although its
API metadata pointed to c69610a; correction was requested from the reviewer.
That inconsistent body has NOT been converted into a valid source approval.
This candidate needs an independent final code review with a resolvable exact
source identity. User authorization to prepare the candidate is not that review.

After the final implementation commit, freeze its actual model-oracle listing.
The existing protected-base worker must independently register and approve the
one-time predecessor-to-successor transition. It currently invokes the missing
old v3.18 binary before oracle reuse; this branch deliberately does not add a
self-authorizing transition or bypass. Activation/main merge remain blocked
until a legitimate trusted-base execution completes. Capacity/deployment remain
the user's next step; no production write, publication or trading occurred.

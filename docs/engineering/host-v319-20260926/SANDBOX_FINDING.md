# Native sandbox compatibility finding — synthetic files only

The baseline named profile still denied source writes and direct loopback access,
but allowed a synthetic sibling file and a synthetic transport/auth.json inside
the temporary operation directory. A synthetic user-cache file was denied. No
actual credentials were loaded, printed or passed to a model.

`native-sandbox-isolation-v2.json` tried --strict-config on sandbox. That option
is unsupported; its negative checks are NOT meaningful isolation passes. The
v3 diagnostic removes that unsupported option and requires the actual OS denial,
while retaining a positive source-read control. It reproduces the two reads.

A closed proposed correction adds explicit denial for the private operation
parent and transport before granting only the source view read and scratch write.
`native-parent-denial-probe.json` records all four target commands; only the source
read is allowed. This is a candidate hardening test, not a complete permission
probe or release approval. The full existing descendant/network/auth checks
must still pass without loosening or bypassing any assertion. Model invocation
and actual credential loading remain prohibited until isolation is proven.

The candidate implementation must use safely escaped TOML paths, reject overlaps
or root parents, and bind the exact operation directory. Independently review
the additional closed hardening scope; identity-only approval is insufficient.
The missing original trusted-host bootstrap remains a separate blocker.

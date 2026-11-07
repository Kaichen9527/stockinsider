# Isolated Contabo staging: offline v2 preparation

`verify.mjs` is an offline, fail-closed preparation tool. It imports no process
runner or network client, reads only its adjacent public `plan.json`, and never
reads environment configuration, an agent socket, public/private key files or
known_hosts. Both the default CLI and `--verify-read-only` exit2 without child
processes or network attempts. The latter reports `OFFLINE_NOT_ADMITTED`: the old
live alias-based verifier has been removed. Other arguments, including the old
`--plan`, are rejected. This source change creates no connection authority.

## Current public facts and intended scope

The public ED25519 host key and fingerprint in `plan.json` are retained from
[the existing owner-attested receipt](../../../docs/operations/2026-11-07/vnext/SSH-READINESS-RECEIPT.json):
`SHA256:yQ4VCXl76rLr6Zep0ybQcHZeK4CfuFmMiZcWJrp2DYg`.
The public key's SSH wire-format SHA256 is recomputed offline. No host key is
re-acquired and no known_hosts file is created. Its authority is the owner's
previous strict pinned login, not a first connection, keyscan or accept-new.

The v2 connection contract allows exactly one canonical `100.64.0.0/10` tailnet
IPv4 and remote TCP22, fixed source `tag:stockinsider-staging-vm`, destination
`tag:stockinsider-contabo`, nonroot user `si-vnext-oct22` and exact forced command
`vnext-preflight-v1`. The destination address remains null until supplied through
reviewed public operator evidence. Tags express intended policy; this file does
not observe ACLs, enrollment or a particular machine's tag/IP binding.

The client public Ed25519 key, exact SHA256 fingerprint, <=1hour future expiry,
intended dedicated executor and candidate writer identity remain unset. The
intended executor must differ from the development executor ID retained in the
existing receipt; a different supplied ID is only intent, not creation or
platform readiness evidence. Public
wire-format/fingerprint consistency and a single matching agent public-key
fixture are mandatory in offline tests. These tests do not establish live agent
custody, key lifetime, server installation, expiry or revocation. No identity is
generated or silently renewed. A source commit is not evidence of a provisioned
writer identity.

## Official Tailscale transport remains unimplemented

The [official VPN reference](skill://plugin_connector_1p_c5b7d5df5d7081918f2c4be5a633ed5d/cloud-environment-runtime/references/vpn.md)
states that Tailscale runs in the sidecar: the executor has no VPN interface or
general Internet route. Raw TCP uses the official outer-executor sidecar
workflow through `proxy:8088`; the reference describes a maintained socat
forwarding workflow. Direct OS SSH to the intended tailnet address is therefore
not a working transport on this executor. Generic network permission, an HTTPS
allowlist, a public IP locator or a saved auth key does not prove readiness.

The contract records only that fixed official reference and
`NOT_IMPLEMENTED_NOT_ADMITTED`. It accepts no connector executable, proxy
command, arguments, ready boolean or caller-created admission attestation.
There is no CONNECT implementation, listener, forward, downloader or installer
in these files. Integrating a supported official connector requires a separate
independent review and applicable authorization on the new dedicated staging
executor. An offline complete plan never passes that gate.

`prepareOfflineRequest` returns a non-executable SSH argument **template** and
an intended remote endpoint, always `OFFLINE_NOT_ADMITTED`,
`platformReadiness=NOT_OBSERVED`, `executable=false`. The address in that template
is intent only; executing it directly cannot provide the required sidecar path.
Future transport integration must preserve the remote IPv4:22 binding and
retained host identity instead of treating this template as a runnable command.

The template discards SSH configuration with `-F /dev/null`; fixes nonroot user,
port and command; selects a dedicated public key and agent socket; pins ED25519
via an exact dedicated known_hosts record for `HostKeyAlias=vmi3152467`; disables
password/interactive alternatives, host-key updates/DNS, arbitrary proxy/jumps,
PTY, SSH agent/X11/port forwarding, tunnels, local/remote commands and multiplex
reuse. Public selector paths are fixed placeholders under
`/run/stockinsider-vnext-staging/`; no such files or socket are created/read here.
The eventual official sidecar transport is distinct from SSH forwarding, which
remains forbidden.

## Offline verification

```sh
node --test scripts/vnext-staging-preflight.test.mjs
node deployment/staging/vnext/verify.mjs
node deployment/staging/vnext/verify.mjs --verify-read-only
```

`verifyOfflineFixture` has an explicitly injected mock child runner and supplied
public fixture strings. The CLI cannot call it. Positive results always say
`SYNTHETIC_FIXTURE_ONLY`, retain `OFFLINE_NOT_ADMITTED`, `stagingAcceptance=NOT_RUN`
and pending isolation proof. Negatives cover public/noncanonical/multiple
addresses, non22 ports, changed pins, key/fingerprint/agent mismatch, expiry,
unknown connector/executable/ready fields, alias/command injection, permissive
SSH settings, malformed gateway/capacity output and formal namespace reuse.
No actual SSH, agent command, key operation or remote service is exercised.

## Closed execution boundary

`execution-boundary.mjs` adds a source/fixture execution contract without a live
adapter. `inspectExecutionBoundary(plan, { now })` reports `Disabled` even for a
complete public plan; `executeReadOnlyPreflight` always rejects. Its only option
is the explicit UTC clock. Caller adapters, approval booleans and provenance
objects are rejected, and no public platform-adapter registration exists.
Independent platform executor identity, official sidecar broker, exact platform
approval and ephemeral agent provenance remain typed `NOT_OBSERVED`
requirements. A future verified platform integration needs its own reviewed
implementation; filling in public plan metadata cannot enable execution.

`verifyExecutionBoundaryFixture` accepts only an explicitly labeled fixture
adapter with `open`, `execute` and `close` functions. The immutable request binds
the new staging executor intent, official outer-executor sidecar CONNECT path,
one tailnet IPv4:22, retained host pin, one short-lived public fingerprint and
one forced command. Its SSH arguments remain a nonexecutable template. No CLI
calls this adapter. Success is `FixtureOnly`, `executable=false`,
`platformReadiness=NOT_OBSERVED`, `stagingAcceptance=NOT_RUN`; `capacityReady`
is separate from `NOT_PROVISIONED` application/database isolation and the other
unobserved isolation dimensions.

Fixture execution and cleanup each have bounded deadlines. Cancellation aborts
the fixture and waits for in-flight work to settle before accepting its cleanup
receipt. Unsettled work taints cleanup even if the adapter claims zero resources;
a late settlement triggers another best-effort fixture close and never changes
the rejected result. These checks validate fixture lifecycle behavior, not
platform process ownership or live cleanup. Gateway output is a bounded flat
JSON protocol: duplicate/unknown fields, malformed/trailing output, stderr,
timeout, incorrect scope and invented provisioning are rejected.

Run the focused source/fixture checks with the repository's pinned Node22:

```sh
/workspace/.tools/node22/node_modules/node/bin/node --test scripts/vnext-staging-preflight.test.mjs scripts/vnext-staging-execution-boundary.test.mjs
```

## Preserved bootstrap and isolation boundaries

`bootstrap.py` is unchanged. It is a separately reviewed account-owner console
instrument, default dry-run; `--apply` requires its own owner authorization,
root console, current capacity, exact reviewed source, absent account/group/
namespace/gateway, public-only client key and future <=1hour UTC expiry. Nothing
here runs it. Its root-owned restricted authorized key accepts only
`vnext-preflight-v1`, forbids PTY/forwarding/user-rc and grants no sudo/docker or
production writer access. The historical one-hour identity expired; neither that
identity nor historical local container SSH checks establish current Contabo
access. Revocation, existing-session handling and partial-apply custody still
need a precise owner-reviewed procedure; bootstrap has no cleanup/revoke helper.

The unique service/runtime identity/queue/storage remain
`stockinsider-vnext-oct22-staging`; database
`stockinsider_vnext_oct22_staging`, schema public within that separate database;
loopback ports34222/34223/34224; fixtures only and schedules disabled. An independent
application network namespace must expose its own REST3302 through staging34223;
never point staging at formal host3302 or relax its guard. No service, database,
writer, queue, storage or application network namespace has been provisioned or
verified by this preparation.

Capacity guards remain unchanged: deduct1GiB WAL+0.5GiB temp+128MiB deployment+
2GiB growth and retain15GiB disk; deduct1GiB peak and retain1.5GiB available memory;
warn below20GiB disk. Full archive/download/restore/deploy peaks require separate
current measurements. Even a synthetically successful readonly gateway response
is not backup/restore, rollback, app isolation, real source/model, native or
release acceptance. All existing gates remain in place.

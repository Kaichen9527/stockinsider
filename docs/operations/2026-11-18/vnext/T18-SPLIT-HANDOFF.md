# Split storage handoff candidate

This candidate adds one supplemental record after the original FD3–8
packet. The existing staging lock stays open in root through cleanup.
The root coordinator validates the live split layout and uses an
authenticated Unix seqpacket peer to pass the RAM image descriptor and
bounded device identity information. The dedicated worker variant reads
the existing channel in FD10, matches the inode identities and checks the
live kernel device generations, loops and UUIDs. The RAM descriptor
closes after the check. The worker receives no device-mapper control FD.
There is no evidence-file or command-line selector for the existing
single-image worker.

The patch targets the independently staged operator source
`f519b65b689a67f14bada9ecb429783de173c2f4`. Its old entry still selects
the original direct-loop validator. The new worker path uses the same
namespace, capabilities, cgroup and swap cap, host lock, mount, capacity
and production PostgreSQL path checks. The coordinator fixture holds
only a synthetic lock and passes three public placeholder descriptors
in the original data slots. It never invokes the restore programs.

The native fixture uses ephemeral systemd scopes with a 768 MiB cap,
no swap and only loopback. It refuses a changed image descriptor and
a separately opened description of the same locked inode. The direct
entry continues to reject the split geometry. PID1’s network namespace
link was unreadable from the worker. The existing guard exercised the
only-loopback and no-capabilities checks and recorded that comparison as
unavailable.

For exact reproduction, stage the fixtures under
`/var/tmp/stockinsider-t18-split-worker`. Put `coordinator-probe.py`
and `worker.py` at its root, place the reviewed geometry module under
`vnext`, and place the handoff module and patched admission module
under `vnext/t17_keyfd`. Copy `t18_fd_handoff.py`,
`stage_credentials.py` and `sealed_fixture.py` from the operator
baseline under the same directory and verify their blobs against the
receipt. The shell fixture uses the provisioned geometry source and
verified old observer from the parent receipt. Launch it in a private
mount namespace on staging. The fixture never accepts or uses backups.

Production use still needs the fixed coordinator’s provisioning,
bootstrap, key custody and cleanup integration reviewed together,
followed by the authorized real database and Next.js rehearsal.

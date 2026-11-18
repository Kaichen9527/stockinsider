# Contabo split workspace geometry probe

The existing single-image observer stays in force. This root-only probe
checks the exact two-image staging layout measured at `2097926`. It
queries the live kernel table and validates both read-only file
descriptors, the two complete loops, the ordered linear segments, the
crypt target, the mounts and the existing capacity floors. Neither the
probe nor its output initiates or approves a restore.

The device-mapper kernel driver checks `CAP_SYS_ADMIN` at ioctl time.
The Contabo native control reproduced this using the same read-only
descriptor after dropping the UID. A later coordinator integration must
validate privileged device-mapper queries in the existing trusted
setup process. Bound the unprivileged worker to its existing lock,
mount, network, cgroup and backup custody checks. Keep device-mapper
control and the key pipe governed by their existing privilege boundaries.
The current storage admission function is unchanged.

Run the three synthetic scenarios in an isolated Contabo staging mount
namespace with the prerequisites from the geometry rehearsal.

```sh
for scenario in valid reversed-mapping swappable-ram; do
  unshare --mount --propagation private /bin/bash \
    deployment/staging/vnext/test-split-storage.sh "$scenario"
done
```

The valid probe also rejects a writable FD, a sparse file, duplicated
FDs and exchanged FDs. It verifies ciphertext on both backings and
repeats the previously measured synthetic disk and memory allocation.
The real kernel negatives mount encrypted layouts and reject them
before creating workload files. No production secrets, Postgres data or
application assets enter these tests. After cleanup, an authorized
coordinator integration and a genuine rehearsal still require their
existing reviews and conditions.

Kernel references [device-mapper ioctl privilege check](https://raw.githubusercontent.com/torvalds/linux/v6.8/drivers/md/dm-ioctl.c),
[tmpfs mount options](https://docs.kernel.org/6.8/filesystems/tmpfs.html),
and [dm-linear target](https://docs.kernel.org/admin-guide/device-mapper/linear.html).

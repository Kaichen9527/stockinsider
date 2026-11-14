# T17 explicit fs-verity block geometry correction

Parent `d537de28891d5224bd64ea08281d574e9ba898e9` incorrectly packed a zero
block_size in fsverity_enable_arg. That was a concrete source defect; Cloud's
ENOTTY refusal did not exercise or validate the ext4 positive path. The onsite
coordinator reports EINVAL22 with that unmodified runner, independently of an
earlier systemd226 namespace setup failure. Neither failure is reclassified.

`disk_custody.py` now fixes block_size=4096 (not a caller override), observes
the held descriptor's actual Linux statvfs filesystem block size and system
page size, and requires valid power-of-two geometry >=1024 with4096 no greater
than either observed size. Unknown/incompatible values reject before ENABLE.
The128-byte argument is version1/SHA256/4096, with every reserved/salt/signature
field zero. New tests verify the actual local geometry/packed fields and refuse
unknown, zero, non-power-of-two and smaller geometry. No pathname/custody or
authentication contract was loosened, and no failed syscall is bypassed.

Independent source reviewer ran focused6/6 tests and found zero open P0/P1 in
this bounded fix plus unchanged fixed-public-PG-runner scope. This is NOT formal
A1, a Linux filesystem certification, positive PG execution or live approval.
The review identifies exact source/test/runner hashes in the JSON receipt.

Coordinator-reported observations: Contabo Linux6.8 successfully enabled verity
using explicit4096 on a NEW32MiB ext4 -O verity image; separately sealed a
491423538-byte real database ciphertext in another dedicated loop image. No key
was transferred and no real backup was restored. Current ext4 was not modified.
Systemd initially returned226 because its manager could not see a caller-private
mount; a unique `/run` scratch mount with private propagation let the public
fixture reach the runner and report EINVAL22. These are reported onsite facts,
not observations by this Cloud VM or admission for another execution.

The coordinator can re-run the SAME fixed-public fixture runner in that reviewed
private disk/network DynamicUser sandbox after pinning this fix's commit and
hashes. Use its existing approved `/run` scratch mount, PG17 conventional tools,
working DynamicUser NSS/peer auth and independently enforced filesystem/cgroup
limits. No key, backup, executable override or live mode is an input. Do not
reuse a private mount invisible to the systemd manager. No provisioning, host
mount or SSH operation is performed by this patch.

Cloud still reports ENOTTY25 on its unsupported disk filesystem and refuses
before initdb/SQL. Full positive fixture/restore is for the onsite re-test; a
new refusal must be preserved with its actual errno. Original live facade,
all nine runtime requirements, native HOLD, PR384, product branch and gates
remain unchanged. Exact full-branch web build/types/lint remain blocked by Git
CONNECT503/full checkout absence; no older-checkout result is substituted.

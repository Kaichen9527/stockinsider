#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 8>/run/lock/vps-heavy-operation.lock
exec 9>/run/lock/stockinsider-production-write.lock
exec 7>/run/lock/stockinsider-production-health.lock
flock -n 8 || exit 75
flock -n 9 || exit 75
flock -n 7 || exit 75
test "$(readlink -f /opt/stockinsider/current)" = /opt/stockinsider-standalone/releases/169aad1b6cfa747f78ae3464b614f43c0749d806
date -u +%FT%TZ
/usr/bin/node /opt/stockinsider/current/scripts/contabo-host-resource-check.mjs /proc/self/fd/3 3<<'BUDGET'
{
  "schema": "stockinsider-capacity-budget-v2",
  "measurementBasis": "Exact normally approved main8bcd Linux artifact: 79,322,648 content bytes/2,585 files plus 600,779-byte manifest. Same existing 128MiB disk allocation budget covers content and per-file block/metadata margin. The 27,563,760-byte archive stays in RAM within unchanged 1GiB peak memory. No VPS build, DB migration/restore, new source documents or backup staging. Unchanged 1GiB WAL, 0.5GiB temporary, 2GiB growth and 15GiB hard floor. This command only measures admission and does not deploy.",
  "databaseRestoreBytes": 0,
  "documentBytes": 0,
  "peakWalBytes": 1073741824,
  "peakTemporaryBytes": 536870912,
  "deploymentBytes": 134217728,
  "localBackupStagingBytes": 0,
  "growthReserveBytes": 2147483648,
  "peakMemoryBytes": 1073741824,
  "minimumAvailableMemoryBytes": 1610612736
}
BUDGET

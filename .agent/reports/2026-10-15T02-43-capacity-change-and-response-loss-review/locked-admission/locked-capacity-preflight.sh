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
  "measurementBasis": "Exact approved prebuilt dd59817f750684b093965f539dd4de466be13077 Linux artifact:79354761 content bytes/2586 files plus600997-byte manifest,79955758 regular bytes/2587 regular files/3101 archive members. Same128MiB allocation budget includes file-block/directory/metadata margin.27574426-byte archive stays in RAM under unchanged1GiB peak memory. No VPS build, DB migration/restore, new source documents or backup staging. Unchanged1GiB WAL,0.5GiB temporary,2GiB growth,15GiB hardfloor. Capacity measurement only; no deployment.",
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

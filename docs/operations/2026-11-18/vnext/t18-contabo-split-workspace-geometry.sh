#!/usr/bin/env bash
# Synthetic geometry rehearsal only. Run from an isolated staging host mount namespace.
set -Eeuo pipefail
umask 077
test "$(id -u)" -eq 0
test "$(readlink /proc/self/ns/mnt)" != "$(readlink /proc/1/ns/mnt)"
disk_image_bytes=1879048192
ram_image_bytes=1610612736
peak_application_bytes=937603072
peak_work_bytes=2723479552
HOST_FLOOR=16106127360
MEMORY_FLOOR=1610612736
WORK_FLOOR=536870912
host_free(){ df -B1 --output=avail /var/tmp | tail -1 | tr -d ' '; }
mem_free(){ awk '/^MemAvailable:/{printf "%.0f\n",$2*1024}' /proc/meminfo; }
sample(){
  local disk memory
  disk=$(host_free);memory=$(mem_free)
  printf '{"stage":"%s","hostAvailableDiskBytes":%s,"hostAvailableMemoryBytes":%s}\n' "$1" "$disk" "$memory"
  test "$disk" -ge "$HOST_FLOOR" && test "$memory" -ge "$MEMORY_FLOOR"
}
test "$(host_free)" -ge "$((HOST_FLOOR+disk_image_bytes+268435456))"
test "$(mem_free)" -ge "$((MEMORY_FLOOR+ram_image_bytes+peak_application_bytes+134217728))"
sample preflight
work=$(mktemp -d /var/tmp/stockinsider-t18-split-geometry.XXXXXXXX)
suffix=${work##*.}
LINEAR="si_t18_linear_$suffix"
CRYPT="si_t18_crypt_$suffix"
diskLoop=
ramLoop=
ramMounted=0
workMounted=0
linearCreated=0
cryptCreated=0
cleanup(){
  local saved=$?
  trap - EXIT
  set +e
  result=0
  if (( workMounted )); then umount "$work/stage" || result=1; fi
  if (( result == 0 && cryptCreated )); then cryptsetup close "$CRYPT" || result=1; fi
  if (( result == 0 && linearCreated )); then dmsetup remove "$LINEAR" || result=1; fi
  if (( result == 0 )) && test -n "$ramLoop"; then losetup --detach "$ramLoop" || result=1; fi
  if (( result == 0 )) && test -n "$diskLoop"; then losetup --detach "$diskLoop" || result=1; fi
  if (( result == 0 && ramMounted )); then umount "$work/ram" || result=1; fi
  if (( result == 0 )); then
    if test -f "$work/root.img"; then unlink "$work/root.img" || result=1; fi
    rmdir "$work/ram" "$work/stage" "$work" || result=1
  fi
  printf '{"cleanupStatus":%s,"rootDiskAfterBytes":%s,"memoryAfterBytes":%s}\n' "$result" "$(host_free)" "$(mem_free)"
  if (( result != 0 )); then printf '%s\n' "synthetic_workspace_cleanup_required:$work" >&2; exit 1; fi
  exit "$saved"
}
trap cleanup EXIT
mkdir "$work/stage" "$work/ram"
test ! -e "/dev/mapper/$LINEAR" && test ! -e "/dev/mapper/$CRYPT"
mount -t tmpfs -o "size=$((ram_image_bytes+peak_application_bytes+134217728)),noswap,nodev,nosuid,noexec,mode=0700" tmpfs "$work/ram"
ramMounted=1
findmnt --noheadings --output OPTIONS --mountpoint "$work/ram" | grep -q -E '(^|,)noswap(,|$)'
fallocate --length "$disk_image_bytes" "$work/root.img"
fallocate --length "$ram_image_bytes" "$work/ram/ram.img"
read -r diskBytes diskBlocks < <(stat -c '%s %b' "$work/root.img")
read -r ramBytes ramBlocks < <(stat -c '%s %b' "$work/ram/ram.img")
test "$diskBytes" -eq "$disk_image_bytes" && test "$((diskBlocks*512))" -ge "$disk_image_bytes"
test "$ramBytes" -eq "$ram_image_bytes" && test "$((ramBlocks*512))" -ge "$ram_image_bytes"
sample backing_preallocated
diskLoop=$(losetup --find --show --sector-size 512 "$work/root.img")
ramLoop=$(losetup --find --show --sector-size 512 "$work/ram/ram.img")
test "$diskLoop" != "$ramLoop"
dmsetup create "$LINEAR" --table "$(printf '0 %s linear %s 0\n%s %s linear %s 0' "$((disk_image_bytes/512))" "$diskLoop" "$((disk_image_bytes/512))" "$((ram_image_bytes/512))" "$ramLoop")"
linearCreated=1
dmsetup mknodes "$LINEAR"
head -c 64 /dev/urandom | cryptsetup open --type plain --cipher aes-xts-plain64 --key-size 512 --key-file - "/dev/mapper/$LINEAR" "$CRYPT"
cryptCreated=1
dmsetup mknodes "$CRYPT"
test "$(blockdev --getsize64 "/dev/mapper/$CRYPT")" -eq "$((disk_image_bytes+ram_image_bytes))"
python3 -c 'import os,sys,re,subprocess,json
cipher,disk,ram,diskfile,ramfile=sys.argv[1:6]
split=int(sys.argv[6])
status=subprocess.check_output(['\''cryptsetup'\'','\''status'\'',cipher.rsplit('\''/'\'',1)[-1]],text=True)
offset=re.search(r'\''^\s*offset:\s+(\d+) sectors'\'',status,re.M)
assert offset is not None and int(offset.group(1))==0,'\''nonzero_cipher_sector_offset'\''
def pattern(name):return ('\''StockInsider synthetic '\''+name+'\'' leg\n'\'').encode().ljust(4096,b'\''\0'\'')
data=[pattern('\''disk'\''),pattern('\''RAM'\'')]
with open(cipher,'\''r+b'\'',buffering=0) as f:
 for i,offset in enumerate([0,split]):
  assert os.pwrite(f.fileno(),data[i],offset)==4096
 os.fsync(f.fileno())
for device in [cipher,disk,ram]:
 subprocess.run(['\''blockdev'\'','\''--flushbufs'\'',device],check=True,stdout=subprocess.DEVNULL)
with open(cipher,'\''rb'\'',buffering=0) as f:
 for i,offset in enumerate([0,split]):
  assert os.pread(f.fileno(),4096,offset)==data[i],'\''mapper_roundtrip_mismatch'\''
raw_checks=[]
for i,backing in enumerate([diskfile,ramfile]):
 with open(backing,'\''rb'\'',buffering=0) as f:
  raw=os.pread(f.fileno(),4096,0)
  raw_checks.append({'\''leg'\'':['\''root'\'','\''ram'\''][i],'\''bytes'\'':len(raw),'\''allZero'\'':raw==bytes(4096),'\''plaintext'\'':raw==data[i]})
assert all(r['\''bytes'\'']==4096 and not r['\''allZero'\''] and not r['\''plaintext'\''] for r in raw_checks),json.dumps(raw_checks)
print(json.dumps({'\''encryptedBothLegs'\'':True,'\''crossDeviceBoundaryRead'\'':True,'\''rawBackingCiphertext'\'':raw_checks}))
' "/dev/mapper/$CRYPT" "$diskLoop" "$ramLoop" "$work/root.img" "$work/ram/ram.img" "$disk_image_bytes"
mkfs.ext4 -q -F -m 0 -E lazy_itable_init=0,lazy_journal_init=0 "/dev/mapper/$CRYPT"
mount -t ext4 -o nosuid,nodev,noexec "/dev/mapper/$CRYPT" "$work/stage"
workMounted=1
sample stage_mounted
admission=/var/tmp/stockinsider-t18-capacity-native.sjd0svWZ/staging_admission.py
test "$(git hash-object "$admission")" = 1278f5118ab89f8a9751acdda904fa9650e4dec0
PYTHONDONTWRITEBYTECODE=1 python3 -c 'import importlib.util,json,os,sys
script,work,image,host=sys.argv[1:]
spec=importlib.util.spec_from_file_location('\''reviewed_staging_admission'\'',script)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
directory=os.open(host,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
file=os.open(image,os.O_RDONLY|os.O_NOFOLLOW)
try:
 info=os.stat(work)
 device=f'\''{os.major(info.st_dev)}:{os.minor(info.st_dev)}'\''
 try:
  module._bind_encrypted_image(device,file,directory,info,os.statvfs(work))
 except module.StagingAdmissionRejected as error:
  assert str(error)=='\''work_filesystem_image_size_rejected'\''
  print(json.dumps({'\''currentObserverRejectedSplitBacking'\'':True,'\''reason'\'':str(error)}))
 else:
  raise AssertionError('\''untested_geometry_must_not_meet_current_observer'\'')
finally:
 os.close(file);os.close(directory)
' "$admission" "$work/stage" "$work/root.img" /var/tmp
fallocate --length "$peak_work_bytes" "$work/stage/synthetic-storage"
verifyWork=$(df -B1 --output=avail "$work/stage" | tail -1 | tr -d ' ')
test "$verifyWork" -ge "$WORK_FLOOR"
fallocate --length "$peak_application_bytes" "$work/ram/synthetic-memory"
read -r jobBytes jobBlocks < <(stat -c '%s %b' "$work/ram/synthetic-memory")
test "$jobBytes" -eq "$peak_application_bytes" && test "$((jobBlocks*512))" -ge "$peak_application_bytes"
sync -f "$work/stage/synthetic-storage"
sample simultaneous_peak
printf '{"rootImageBytes":%s,"ramImageBytes":%s,"totalEncryptedBytes":%s,"syntheticStorageBytes":%s,"syntheticMemoryBytes":%s,"workFreeBytes":%s,"noSwapRamMount":true,"realBackupOpened":false,"productionModified":false}\n' "$disk_image_bytes" "$ram_image_bytes" "$((disk_image_bytes+ram_image_bytes))" "$peak_work_bytes" "$peak_application_bytes" "$verifyWork"

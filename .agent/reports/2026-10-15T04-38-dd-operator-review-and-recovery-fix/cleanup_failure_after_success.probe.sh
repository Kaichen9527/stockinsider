set -euo pipefail
old=old
root=/never-used
current=/never-used/current
previous=/never-used/previous
previous_before=
previous_changed=false
work=/never-used/work
set_pointer(){ echo MOCK_POINTER_RESTORE; }
bash(){ echo MOCK_ACTIVATE; }
readlink(){ echo /never-used/old; }
writer(){ echo MOCK_WRITER; }
systemctl(){ echo MOCK_SERVICE; }
rm(){ :; }
rmdir(){ return 1; }
changed=false
finish() {
  local rc=$? recovery_ok=true
  trap - EXIT
  set +e
  if [[ $rc -ne 0 && "$changed" == true ]]; then
    set_pointer current "$root/$old" || recovery_ok=false
    bash "$root/$old/deployment/vps/activate-writer-release.sh" "$old" || recovery_ok=false
    test "$(readlink -f "$current")" = "$root/$old" || recovery_ok=false
    writer "$old" false || recovery_ok=false
    systemctl is-active --quiet stockinsider-web-standalone stockinsider-internal-worker || recovery_ok=false
    if [[ "$previous_changed" == true ]]; then
      if [[ -n "$previous_before" ]]; then set_pointer previous "$previous_before" || recovery_ok=false
      elif [[ -L "$previous" && "$(readlink -f "$previous")" == "$root/$old" ]]; then rm -f "$previous" || recovery_ok=false
      else recovery_ok=false; fi
    fi
    if [[ "$recovery_ok" == true ]]; then echo 'previous_current_and_writer_restored';
    else echo 'recovery_required:previous_current_or_writer_not_confirmed' >&2; fi
  fi
  rm -f "$work/artifact.tar.gz"
  rmdir "$work" || echo 'owned_ram_cleanup_failed' >&2
  exit "$rc"
}
trap finish EXIT
exit 0

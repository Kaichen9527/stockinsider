# Unsigned Linux artifact preparation review

Subject `8d80ffb447c80f931f7a2012b821f5e2895506b8`, base `2e078dfdd74272d3d50dffdd4cc6c14df3152c78`. Only `.github/workflows/reviewed-linux-artifact.yml` changed.

**REQUEST_CHANGES — one P2.** The workflow creates only `$export_dir`; the packager requires `$destination` to already exist and calls realpath on it before packaging. A fresh runner therefore failsENOENT. Reproduced with unchanged packager and a unique nonexistent directory; nofiles/build/production activity.

Minimal fix: `mkdir -p "$destination" "$export_dir"` before package invocation. Keep original packager/verifier and allidentity checks.

Otherwise reviewed controls are appropriately bounded: exacthardcoded source,readonly token,pinnedexistingactions,no credential persistence,locked dependencies,clean trackedsource,original selective packager/verifier,hash/source sidecars and14day artifact retention. No deployment/DB/gate/approval action exists. Artifact generation is preparation, not protected acceptance or deployment authority.

No fullbuild or Actions execution performed. Dependency source and eventual compiled artifact bytes are not independently verified by this static workflow review.

Probe `/tmp/stockinsider-linux-artifact-8d80-probe.log`; structured report `/tmp/stockinsider-linux-artifact-8d80-review.json` SHA256 `67a6f4e749cd9edcdb2b99310d0cc79e1b434af552e01993ec395d621171a766`.

# Actual commands and interpretation

Working directory `/tmp/si-pubtail-o14`; Node `/workspace/.tools/node22/node_modules/node/bin/node` v22.14.0.

- `git fetch origin codex/reviewed-publication-artifact-release-oct14`; created isolated review branch at df18448d. Exact identity/base diff/source hashes are in raw identity and source manifest.
- `git fetch origin c2b146adb6d03814f2bd9a7af72baf003bb48812` retrieved required original Git object; no artifact downloaded.
- YAML parsed with installed Python PyYAML6.0.3; exact shell/inline blocks saved under extracted. 11 `bash -n` and 3 Node `--check` calls are fully listed with timestamps/exits in raw/command-results.json.
- `/usr/bin/time -v NODE probe.mjs` did not execute Node: tool absent, exit127 retained. Python subprocess/resource then ran NODE probe.mjs. Parser/cache lookup completed; resolver failed on sandbox spawnSync Git EPERM, raw exit1 retained.
- NODE resolver.mjs (read-only subprocess capability) returned exit0: one actual Git positive, two actual Git negatives, three explicitly mocked repository negatives. Original command stderr includes expected missing-object errors.
- NODE `--test regressions.test.mjs`: initial sandbox file-level failure retained. With subprocess capability the exact same sealed test produces 0PASS2FAIL0SKIP, proving R1/R2 assertions fail. This is not a fresh application suite.
- No browser process was launched: the executable lookup only checked the pinned registry against a fresh absent cache path. No download/install occurred.
- Exploratory source reads/rg errors (nonexistent guessed filenames) supplied no finding; exact successfully read sources and relevant excerpts are sealed separately.

To reproduce extracted probes in an authorized read-only review, copy extracted files to `/tmp/reviewed-artifact-workflow-review-o14/` and the three probe files there; execute with the frozen subject as cwd. The mock parser streams are intentionally not canonical run receipts. No workflow run script should be executed: step files are saved solely for syntax inspection.

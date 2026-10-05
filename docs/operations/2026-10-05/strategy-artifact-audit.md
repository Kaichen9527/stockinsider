# Retained strategy artifact audit — October 5

The actual retained PR284 artifact passed **740 limited derived-data checks**
across all 15 strategy/scenario results. This verifies exported arithmetic and
internal chronology, not market data, actual fills, historical availability or
profitability. The investment-validation result remains
`failed_insufficient_evidence`; promotion and submission remain disabled.

## Exact execution record

- Audit time: 2026-10-05 13:16:57 Asia/Taipei.
- Implementation base: `c734d97ce4fff124a7928769af1b4e9bae4adf03`.
- Auditor execution commit: `bc043e38f416f45918ff0ea31f7da6e84540111e`.
- Auditor Python bytes SHA256: `d1c1190d527bb9a964afd951a16ec402fe2ef2b5b93131fdded76220358a4b28`.
- Original experiment source: `e1fb505a894105e05fb08aa28fd0fb8ad8e520fa`.
- Original run: `a9123545831d8ee1a39b231c`, GitHub run `36081668572`.
- Inventory SHA256: `3313c139c0d972a263933eb970fa5dd40caf6cc660bd4d1f1284ebb359b87c04`.
- Dataset manifest SHA256: `a89bf8e5cbcfc464463a53c29f1f5f68f6419d72f2a06befcaeb008e3cff5cca`.
- Frozen registry SHA256: `abd03f9bbe3230575f3e14016c8c1fd92fef6ad00155c0d743612754e8bcc98d`.
- Report: 73,590 bytes, SHA256 `a50b3c86eb57c64f22b781a732beb3cf8ea269dde2c7730e22b2c3349083a7bf`.
- Receipt SHA256: `458ec86773eacce16b2821b5155330d055511b19411a0b90089fd52c43b7c284`.
- Private local output directory:
  `/Users/kaerchen/.cache/stockinsider-workspaces/artifact-audit-20261005-bc043e3`.

The output directory is mode 0700; `report.json` and `receipt.json` are exclusive
mode-0600 files. Existing output is never overwritten. This sanitized summary and
the hashes preserve the findings in Git; the full private receipt is not a
protected review attestation. The following documentation commit does not change
the auditor bytes or imply that it executed at that later commit.

## Findings from the retained results

All 24 files match the pre-existing inventory. The original denominator remains
eight stocks: 2330, 2317, 1216, 2882, 2603, 6488, 5347 and 8069. The admitted
cash-only subset is 1216, 2330, 5347, 6488 and 8069. Exclusions remain visible:
2317 has missing explicit action factors, unsupported calendar gaps and unresolved
actions; 2603 additionally has unmodeled subscription/share-delivery cash flows;
2882 has unmodeled rights subscription and unresolved corporate actions.

S5 and S7 remain blocked for missing historical point-in-time events. S4 has zero
signals and zero trades in every scenario. No failed or negative scenario was
discarded. The recorded 684/684 source requests are a historical manifest claim,
not a new fetch or independent verification of raw source bytes.

| Strategy | Scenario | Closed trades | Net CAGR | Maximum drawdown | Fill-derived commission | Fill-derived sale tax |
|---|---|---:|---:|---:|---:|---:|
| S1 | baseline | 33 | 0.021265% | -3.090391% | 84,498.22500 | 87,103.05000 |
| S1 | cost stress | 32 | -0.476971% | -3.843033% | 162,297.09750 | 83,317.65000 |
| S1 | small capacity | 15 | 0.095015% | -1.977100% | 3,342.26625 | 3,531.60000 |
| S2 | baseline | 79 | -1.027827% | -6.218403% | 199,889.66625 | 206,529.30000 |
| S2 | cost stress | 67 | -1.330955% | -7.607303% | 334,400.19000 | 172,067.40000 |
| S2 | small capacity | 48 | -0.881054% | -4.419675% | 10,253.58750 | 10,647.90000 |
| S3 | baseline | 36 | 1.226195% | -4.599536% | 91,562.09250 | 96,525.75000 |
| S3 | cost stress | 36 | 0.739667% | -4.412102% | 180,827.08500 | 95,076.90000 |
| S3 | small capacity | 15 | 1.220208% | -3.091928% | 3,383.94750 | 3,656.40000 |
| S4 | baseline | 0 | 0.000000% | 0.000000% | 0.00000 | 0.00000 |
| S4 | cost stress | 0 | 0.000000% | 0.000000% | 0.00000 | 0.00000 |
| S4 | small capacity | 0 | 0.000000% | 0.000000% | 0.00000 | 0.00000 |
| S6 | baseline | 25 | -0.096000% | -1.662761% | 60,125.31000 | 63,403.20000 |
| S6 | cost stress | 23 | -0.339172% | -2.155045% | 108,212.64750 | 56,949.00000 |
| S6 | small capacity | 10 | 0.057619% | -0.705617% | 2,169.63375 | 2,294.85000 |

Money columns are TWD calculated with the frozen experiment assumptions, not a
claim about actual broker invoices. CAGR and drawdown were independently
recomputed from retained equity curves, not independently marked raw prices.

There were no discrepancies within the declared numerical tolerance (relative
1e-10, absolute 1e-7). Checks also reconcile exported capital decomposition,
signal-to-fill recorded-session order, trade/fill share identity, retained open
holdings, cost assumptions and ledger bindings. A recorded calendar's next row
is not independently certified as the next official trading session.

Seven evidence groups remain explicitly **unavailable**: actual fills/slippage;
raw marks/dividend accounting; official session/action replay; historical PIT;
all-market generalization; research/KOL comparison arms; holdout/forward results.
The known 1216 event dated 2023-08-03 still requires the separate reviewed
calendar amendment and exact-input replay. This audit does not fix or override
the prior failed run. It reads no normalized tables, sealed 2024+ data, optional
files or artifact-supplied executable modules.

## Reproduction and validation

From the repository root, using the verified `/usr/bin/python3` interpreter
(Python 3.9.6 on this Mac) and a new physical output directory each time:

```sh
/usr/bin/python3 -m unittest discover -s research/tw-strategy-lab -p 'test_artifact_audit.py' -v
/usr/bin/python3 research/tw-strategy-lab/artifact_audit.py --output /absolute/new-audit-directory
```

The original fourteen adversarial contract tests passed. They include modified results and
inventory, omitted or symlinked input, nonfinite/duplicate JSON, size limits,
out-of-period and duplicate dates, altered costs, same-session signals,
duplicate fills/trades, lost holdings, network prohibition, input allowlisting,
private permissions and refusal to overwrite receipts. These mutated fixtures
test rejection behavior; they are not experiment results.

Exit 0 means `program_status=completed` and
`audit_status=partial_derived_verified`. Investment validation still fails for
insufficient evidence. Exit 2 records admission or calculation discrepancies.
Neither path manufactures proposal/assessment parents, calls an authenticated
endpoint, runs a simulation or enables trading.

## Successor addressing independent review findings

The independent review identified two P2 issues: a Python build without
descriptor-relative `os.open` failed after creating output, and a symlink in an
input ancestor was accepted. The successor preflights runtime capabilities before
auditing or creating output. It returns exit 2 with `unsupported_runtime` without
creating a directory if the required no-follow/descriptor operations are absent.
It never falls back to weaker filesystem operations. The actual installed
`/usr/local/bin/python3` (Python 3.9.1) was checked: exit 2, `output_created=false`,
and the requested output path remained absent. An unqualified `python3` command
can select that unsupported interpreter depending on PATH.

Every input and output parent is now traversed from `/` with directory
descriptors, `O_NOFOLLOW` and device/inode checks. Parent traversal and symlink
ancestors are refused; the admitted artifact directory stays pinned across all
24 reads. Renaming a parent after it is opened cannot redirect subsequent reads
to a replacement path. Use physical paths: ordinary macOS aliases such as `/tmp`
or `/var` may be symlinks and are deliberately refused.

Twenty-one tests passed under `/usr/bin/python3`, including simulated unsupported
capabilities, actual-operation probe failure, symlink ancestors, directory
replacement between stat and open, and path redirection after opening a parent.
The adversarial fixtures are still only rejection tests, not investment evidence.
`git diff --check` and the isolated web production build also passed. The build
log is `/tmp/strategy-artifact-audit-successor-web-build.log`; no frontend,
dependency, engine, schema or frozen artifact files changed.

The successor actual retained-artifact execution, without new simulation:

- Time: 2026-10-05 13:23:53 Asia/Taipei.
- Auditor execution commit: `7e887ef642f9aeeb66ff0dae63ffc97825c9c234`.
- Auditor Python bytes SHA256: `4e67d5c2a8c10d7a374ba2bcc5b1940178bd661ffac563529b77b8ec393252d3`.
- Report: 73,590 bytes, SHA256 `a50b3c86eb57c64f22b781a732beb3cf8ea269dde2c7730e22b2c3349083a7bf`.
- Receipt SHA256: `2b6d337287ddc1028964bb90d66023efe60c398fe68a8e46350831bab7aa6f7b`.
- Private local output directory:
  `/Users/kaerchen/.cache/stockinsider-workspaces/artifact-audit-20261005-7e887ef`.
- All 24 pinned files and 15 paths passed the same 740 checks, with zero
  discrepancies; report bytes are identical to the original run. Both new files
  are mode 0600. Original hashes, artifacts and receipts remain untouched.

This new receipt binds the corrected auditor bytes. It does not replace the
original evidence or change any unavailable/investment-validation result.

## Independent review and root integration

Independent review approved exact `9b6cb4d9d8716060eb12d3d8cb7374b845872857`
against `c734d97ce4fff124a7928769af1b4e9bae4adf03`, closing both P2 findings.
The reviewer reran 21 tests, the actual retained audit, the unsupported-runtime
probe and directory replacement during artifact reads. This is unsigned scope
review, not protected approval or investment validation.

Root integrated with merge commit `d048882005af25c66745f8381e618af34e70846d`,
reran all 21 tests and the retained audit at 2026-10-05T05:33:01.826285Z. The report
hash and 73,590 bytes remain identical; root receipt SHA256 is
`c8001e0ac763437c3a614768defa1aff0667ce012eafa3aeac6b5b0b39ff4343`.
Private output lives at
`/Users/kaerchen/.cache/stockinsider-workspaces/artifact-audit-root-d048882-oct05`
with files mode0600. Original receipts remain preserved.
Root `git diff --check` and the normal production build passed after integration;
the build log is `/tmp/stockinsider-strategy-audit-root-build-oct05.log`.

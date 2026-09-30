# Host/Astra recovery candidate — 2026-09-30

This candidate updates the unactivated PR285 successor using a fresh signed-native observation and the user's Astra High-only instruction. It does not activate itself or repair the protected base by assumption.

- Exact native: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`, version `codex-cli 0.158.0-alpha.2.1`.
- Native SHA256: `3e11ccc743e8198a5ef84fb57c89941d845b0ea0302485ed1fbac2f0821aca5a`.
- Frozen fixture v3.21 pre-LF SHA256: `c43c25a48f442dc0aa8902918243efc9fac354c4bfe3ef9af7432d093ed2aed9`.
- New runner identity: `0a34cc38c06e432c865aa842278cf05fae724ecf0313f795e753f2086d02cfe1`,894 canonical bytes.
- All routes use `gpt-6-astra` / `high`. Old manifests, strategies, waivers and model arguments are rejected. New manifests and a separate ignored runtime namespace preserve historical state.

## Observed local checks

21 noncredential model-runner tests passed with `OPPORTUNITY_V3_PROTECTED_NO_LIVE_AUTH=1`. This explicitly excludes the two protected live oracles; no claim is made that all28 registered MR3 cases passed. The real generated sandbox policy passed nine synthetic canary checks (`canary.json`); no real credentials were loaded or model invoked. App/native signature verification and notarization passed (`observation.json`). Production Web build passed after installing locked dependencies in the worktree. Host contract/identity/acceptance mirror consistency and `git diff --check` passed.

An independent Astra reviewer found catalog/contract/count and direct-entry issues in this candidate; all four were repaired and the limited recheck found no remaining actionable findings. This review is not a complete exact-source protected attestation or activation approval. Original PR285 observations/reviews are preserved and are not relabeled as this candidate's evidence.

## Deployment remains blocked

Protected main still starts a removed executable before candidate tests. Its closed successor maps end atv3.18, while the active root ruleset has no bypass actors. A genuinely reviewed base-owned recovery amendment must bind this final candidate commit/tree, signed native identity and independent review provenance, and repair both candidate sandbox launch and permission policy. Candidate-defined registration, forged checks, disabling protection or substituting local tests are excluded. No approved ordinary bootstrap route has been observed.

After that authority exists, a fresh protected PR event—not a rerun with an old pinned base—must execute full checks and live Astra oracle. Then the research PR requires its own final-source attestations, full acceptance, safe migration/writer cutover, and VPS resource admission. The measured VPS currently fails whole-host disk reserve. No merge, production deploy, database write, schedule enablement or strategy adoption occurred during this preparation.

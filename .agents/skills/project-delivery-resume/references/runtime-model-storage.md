# Runtime, models and storage

Recommendations checked 2026-11-22; current project instructions and actual authorization override defaults.

## Runtime

- Existing Codex Cloud tasks may retain saved files/tools including dirty work; new tasks start from published environments. This does not replace verified remote source control.
- Use compatible macOS/Xcode for iOS platform build, simulator and signing. Linux can handle portable/backend/Web work but its pass is not an iOS pass.
- Android Gradle/JVM work can use suitable Linux/Mac. Instrumentation needs a real device or usable emulator; check acceleration once instead of repeatedly relaunching an incapable VM.
- The user now prefers capable Codex VM first and isolated Contabo development second for portable tasks. This updates earlier VM-only preferences without authorizing writes to production or loss of unique WIP. Read `clients-and-cloud.md`, preserve checkpoints/attempts/owner, and use one heavy owner on a constrained host.
- Measure the actual checkout filesystem and internal reserve before heavy work. Removable capacity is separate from internal free space; preserve this project's stop/resume thresholds and next phase's peak.
- Prefer verified secondary archives on a small FAT32 card, not the sole repo, build/cache, simulator or database. Single-file and filesystem semantics differ from an appropriate development filesystem. Do not format or delete the card based on an inspection request.

## Model routing

| Task | Starting recommendation | Escalate when |
|---|---|---|
| Heartbeat, percent, TTL, event deduplication | Ordinary code, no LLM | Data contract requires bounded diagnosis |
| Short state/metadata/easy edit | Smaller available model or Sol Low/Medium | A consequential ambiguity remains |
| Scoped feature/fix | GPT-6.2 Sol Medium; High for complex multi-file work; Sonnet 5.5 Medium alternative | Evidence shows a harder cross-layer problem |
| State race, difficult root cause | GPT-6.2 Astra or Opus 5.5 Medium, increase effort if justified | A concrete question remains within fixed diagnosis budget |
| High-impact architecture/review | Strong independent reviewer | Do not permanently route all later work to most expensive model |

Official Claude guidance starts Opus 5.5 at Medium. Effort scales differ across models. Disk, auth, missing runner/emulator and unavailable network are not reasons to raise effort. Record requested/observed model, effort, reason and escalation condition. Suggest a manual switch only where no actual switch capability exists.

Subscription usage/credits and API USD are different. Use observed metrics, not invented costs from elapsed time. Compare cost per accepted criterion and repeated-work ratio. Animated office characters require no model calls.

## Prevent new output growth

Write small receipts: criterion, command, source/tree, dependencies/environment/fixture fingerprint, result/times, failure signature, artifact hash/location. Do not paste stdout or full transcripts into memory/cards.

Suggested prospective debug limits: 16 MiB text/run, 512 MiB watched debug directory, 5 GiB aggregate new output warning/project, last 3 useful successful debug bundles or 7 days. These are starting policies after reading the project's rules, not authorization to delete protected history. Native candidates, crash symbols and unresolved unique evidence need explicit exceptions.

Avoid successful video by default; keep selected screenshots and failure traces. Deduplicate repeated failure fingerprints. Reuse bounded compiler caches; blanket cache deletion increases rebuild time. Keep only useful retained successful copies after verifying receipts and required artifacts.

## Existing disk recovery

Inventory the selected project's directories, size, live owner and rebuildability. Separate source/WIP, DBs, devices/Keychain/signing, original research/attachments, current binary/symbols, unresolved failure evidence, duplicate successful output and rebuildable cache.

Clean only exact, owned, stopped, superseded, recoverable paths under an applicable approved policy. Verify summaries, required originals and durable backup/rebuildability first. Never blanket-delete `.run`, run `git clean`, reset simulators or prune all Docker to satisfy a quota. Never delete other projects, unique DB/source/evidence/keys or uncommitted work.

iCloud sync does not expand local working capacity; active builds need real free space. Do not move a live build/DB into a sync directory as a fix. Verify actual offload and measure the checkout filesystem.

Store code/small state/receipts in Git. Large retained artifacts need bounded retention, hash-verified remote storage and expiry awareness. GitHub artifacts/cache also cost storage; transferring 100 GB of unfiltered output is not growth control.

## Planned 1 TB external disk

Read `external-disk.md`. The planned disk is not observed hardware. Verify UUID/mount/filesystem, resolved workspace, separate internal/external reserves and next-phase peak before adoption. Use the read-only `external_disk_preflight.py` when applicable. Never silently write into an unmounted /Volumes path, auto-format, move live data or assume Mac disk capacity exists in Codex VM or managed Antigravity remote.

For Antigravity, separate client, environment and underlying model. An actual hook may report modelName; otherwise record unknown. Four clients share one task ledger and source checkpoint, not one hidden conversation. Prefer smaller available models for routine work and independent stronger review only for a demonstrated need, using current account availability and observed cost; names alone do not establish price or automatic switching.

# Repository, Claude and Antigravity adoption

Personal installation makes this skill available in this ChatGPT/Codex skill directory. It does not modify the Mac, Claude, project repos or VMs. Read-only audits do not install anything on a host. GitHub support-branch adoption and actual host installation are separate receipts.

1. Verify correct repo/worktree/branch and existing rules. Preserve dirty work.
2. Place common SKILL.md, shared references and scripts in `.agents/skills/project-delivery-resume/`. Copy only the selected project's profile as `references/project.md`; never copy other projects' private profiles into this repo, especially if it is public. Pin a version/hash in the existing provenance manifest.
3. Add a short reference in the existing AGENTS.md, retaining current rules. Reconcile a real conflict with a small explicit amendment. Do not import multi-megabyte memory history as permanent instructions.
4. In existing CLAUDE.md add `@AGENTS.md` if absent, retaining Claude-specific rules. If the Claude skill path is absent, create `.claude/skills/project-delivery-resume` as a repo-relative symlink to `../../.agents/skills/project-delivery-resume`. Do not overwrite an existing skill/plugin.
5. Commit actual files and relative link. Verify Codex, Claude Code and Antigravity App/CLI/IDE each discover the same skill in the actual host. Do not link to a Mac absolute path.
6. On other hosts check out the verified commit; configure host tools/secrets/hooks separately. Preserve task/retry state.

Example AGENTS entry:

```markdown
## Delivery continuation
Use `.agents/skills/project-delivery-resume/SKILL.md` when resuming delivery.
Read the existing current-state entry and active tracker first.
Project-specific requirements, release gates and data constraints remain applicable.
```

Do not create a competing HANDOFF when the project mandates one memory file. Install Matt plugin or editable files once per client, not both. Do not upgrade a pinned OpenSpec/Spec Kit/runtime just because newer documentation uses different commands.

Codex invocation: `使用 $project-delivery-resume 的 resume 模式接續本專案；核對最新狀態，先讓我確認本次剩餘範圍（已有同範圍明確確認則沿用），再領取依賴滿足的卡，依有限預算持續完成並保存GitHub交接。`

Claude Code invocation: `/project-delivery-resume 接續本專案；沿用同一張卡、revision、checkpoint與累計嘗試，確認本次剩餘範圍後續作，不重新規劃整個產品。` For Claude chat without a coding environment, read the selected prompt and current state for discussion/review; do not claim this slash command installed a CLI or connected a VM.

If discovery is unavailable, explicitly read the repo SKILL.md. Do not pretend a slash command or tool was executed. Personal installation does not imply per-project adoption has occurred.

Antigravity entry: open the actual repository root, invoke `/project-delivery-resume` where discovered or explicitly read `.agents/skills/project-delivery-resume/SKILL.md`; state the selected lifecycle mode. Read `antigravity.md` before configuring MCP or hooks. Do not overwrite an existing mcp_config.json or force continued execution in observability hooks. For managed remote, attach the correct GitHub source and verify its independent tools; a local installation is not inherited.

For capacity policy, install the generic `project-storage-guard` beside the delivery skill when requested. Keep its generic files separate from private project profiles; it reuses the delivery runner instead of forking one. A new workspace appears in the Site only after authenticated registration; register real host/path ownership and verify actual adapter availability.

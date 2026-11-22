# Portable project kits

Maintain one common core, version it once, and build project-scoped distributions containing only the selected profile. Preserve that core hash and the project profile snapshot in a manifest. Per-project Codex Chat, Codex VM, Claude and Antigravity prompts adapt capabilities while sharing the same task/decision/checkpoint contract.

Preferred adoption is versioned files in the project repository. A ZIP is a transport/export snapshot for a machine without the checkout, not live synchronization or an executable agent. Extract into a separate directory first; do not overwrite an existing project blindly. Do not add a growing sequence of ZIPs to each repo.

Use the supplied kit installer in preview mode first. It copies selected files only, refuses conflicts, adds clearly bounded instruction snippets without removing existing rules, and creates a repo-relative Claude skill link where supported. It does not initialize Git, authenticate, commit/push, edit hooks, run tests, change runtime or start an Agent. Review then apply. If an existing skill differs, reconcile a versioned update rather than deleting it.

Claude Code uses the project `.claude/skills/project-delivery-resume` entry; Codex uses `.agents/skills/project-delivery-resume`. A relative link can point Claude at the same canonical folder. If a filesystem cannot preserve this, use an explicitly verified mirror on a suitable development filesystem and check hashes. FAT32/exFAT storage is not a reason to discard file semantics or keep the only source there.

A project kit ZIP is not automatically a Claude.ai custom-Skill upload. Claude.ai has its own capability and upload format; an attached ZIP also does not grant local filesystem or CLI access. For ordinary Claude chat, attach/read the selected prompt and current GitHub state and use discussion/review unless a real coding environment is attached. Avoid globally installing multiple same-name project variants: choose the current project-scoped kit.

Do not copy the private portfolio report or other projects' profiles into a public repo. For a public project use only that project's redacted state and generic workflow. The private office source/portfolio archive belongs in an authorized private GitHub location.

Antigravity App/CLI/IDE discover the same project `.agents/skills` entry. Its Google-managed remote sessions do not inherit local installation; verify repository files and remote capabilities explicitly. Each of the four project prompts includes new/resume/change/triage/closeout modes. Existing half-finished projects default to resume.

The consolidated all-in-one delivery ZIP is an index and transport envelope. Select only one project kit. Keep private portfolio files outside any public project. An existing v4 installation that differs must be reconciled through a reviewed version-control diff; do not delete original files merely to pass the conflict-refusing installer.

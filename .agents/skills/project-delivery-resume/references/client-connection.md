# Connect the actual development client

Treat adoption, workspace identity, authenticated transport and observed execution as separate checks. A missing `codex` binary is never a reason that Claude Code must hand registration to Codex. Claude Code has its own remote HTTP MCP client. A preflight entry reporting that another client binary is not_available is only inventory, not a prerequisite failure for the active client. Desktop's Code tab can read the same user-scope configuration; ordinary Claude chat and cloud connectors have different capabilities.

## Reuse the installed state

1. Read the actual kit receipt and managed-file baseline. If adoption already succeeded, do not reinstall the same files. Preview an exact supported upgrade only when the core changed; preserve custom rules and WIP.
2. Read the current client's MCP configuration and connection status without printing credentials, static headers or helper stdout. Reuse the matching server. For Claude Code, prefer the existing user-scope server and an absolute `headersHelper` backed by the operating system credential store. No credential belongs in a product repo, ZIP, prompt or log.
3. Verify transport and authentication independently. An HTTP endpoint and OAuth discovery document do not prove this particular service accepts the external client. A platform-reserved native plugin MCP endpoint may require OAuth while a separately configured private service endpoint uses service credentials. Reuse the verified client profile; do not replace it with a native-plugin URL or invent a new path. Use the service's supported authentication method; never impersonate a visitor header, change the Site audience or rotate credentials just to diagnose a connection.
4. Read `tools/list`, then `get_portfolio` and `get_workspace_coordination`. Capture only the server/version and successful read timestamp. A configured server or installed helper alone is not a verified connection.
5. Run the bounded probe on the exact worktree. Reuse the existing workspace for the same stable host and canonical path. Otherwise submit its real descriptor and read back the ID. Obtain the ID from the result; do not ask the user to copy it between IDEs.

The private transport package may contain a host-specific helper and installation receipt. A project kit intentionally does not contain another project's private registry or secrets. Native ChatGPT/Codex Site tools may already be available; do not create duplicate MCP servers there.

## Antigravity: discover the active configuration and reuse one service entry

Read `antigravity.md` for the actual App/IDE/CLI surface. When modern and legacy installations coexist, inspect the known user-scope `~/.gemini/config/mcp_config.json` and legacy `~/.gemini/antigravity/mcp_config.json` without scanning the home directory or printing credentials. Resolve symlinks and file identity first; if both names point to one file, merge the canonical target once and preserve the link. Confirm which configuration the running client loads. Reuse its existing service entry and preserve unrelated servers/options; do not add duplicates or copy private authentication into a project configuration. A running App does not require a separate CLI in PATH to load this configured MCP server.

A bare private `serverUrl` or advertised OAuth support is not proof of service authentication. Do not copy Claude's `headersHelper` field into another client without verified support. If protected dynamic headers require a local bridge, use the reviewed private stdio adapter: an explicitly verified interpreter plus the installed bridge's absolute path, with credential-store access kept outside argv, environment, repo and logs. Replace only that entry's obsolete remote transport fields. The bridge forwards MCP; it does not install a heartbeat mapper, start a writer or need Codex/Claude CLI.

After reloading the existing server in the active client, separately verify tools discovery, actual portfolio/coordination reads, real workspace identity and then genuine task events. A bridge health check or another client's success cannot stand in for this conversation's tool refresh. Preserve the current writer, original task/memory and budgets; connection repair never grants a second lease or product/release acceptance.

## Preserve the current writer

Fixing registration does not transfer ownership. If this same session is already the writer, preserve its run, identity, task and valid lease; read back or renew as appropriate. A helper session doing connection repair remains read-only toward the product. Never start a second model, acquire a competing lease or rewrite the product handoff while another session owns it.

If an existing writer was not instrumented, record that coordination is not yet enforced. At its next safe task boundary, the writer itself verifies process ownership, source revision and budget, then adopts the real registration/lease protocol. Do not create a fake lease or fake event on its behalf.

## Report actual work

After authentication, the current execution session reads the exact source card's `taskRevision` and reports its true `task_started`, role, run/session identity and client. A health check, installation, registration or a process named Claude is not evidence of an active task. Use bounded checkpoints and genuine status changes for subsequent events. Heartbeat is liveness, not accepted progress; only real evidence updates progress. A paused or finished session should look paused or finished.

Claude hooks are lifecycle events, not a built-in periodic heartbeat. Raw hook JSON is not an MCP `report_run_event` payload. Automatic telemetry requires a separately implemented mapper with task binding, sequence state, failure handling and any lease proof. Until it is installed and exercised, use explicit genuine MCP reports and describe automatic reporting as unconfigured. Hooks never keep a model running, extend attempts or prove child processes stopped.

## Fail without forcing an IDE switch

Classify failure as missing client configuration, missing credential, denied authorization, incompatible protocol, network/TLS, unavailable tools or stale source revision. Preserve the precise non-secret failure and one bounded corrective attempt. If the actual user must unlock a credential store or complete a real login, explain that concrete step. Do not ask for unrelated app control or instruct the user to switch to Codex merely to move IDs. Existing approved, independent work and its GitHub checkpoints can continue while Site telemetry is pending; missing telemetry must remain visible.

## Chat and triage

Let the user discuss in the current capable ChatRoom. The coordinator extracts the decision, constraints and next action, saves them to the original project tracker/memory and verifies the remote checkpoint, then synchronizes the Site projection. The Site inbox is optional and does not automatically invoke a model. Do not require duplicate user entry.

Keep all source cards in their original stage, including blocked cards; add role grouping as a separate view. Suggested role classification is not an assigned live Agent. Technical/environment/tracker diagnosis belongs to an Agent, dependencies belong to their upstream work, and only an immediate consequential choice belongs in Needs You. Group repeated blockers into one next action while retaining all cards. Historical blocker notes on Done cards do not create new active work. A technical diagnosis within existing authorization does not require a new change request or a fresh human approval. Preserve real scope, budget, release and account decisions.

Primary documentation checked 2026-11-22: https://code.claude.com/docs/en/mcp ; https://code.claude.com/docs/en/desktop ; https://code.claude.com/docs/en/hooks .

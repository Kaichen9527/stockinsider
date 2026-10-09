# Protected release: actual remaining prerequisite

This is a read-only observation relayed by the existing recovery reviewer on October 9. No original disk log or absolute observation timestamp was retained; the immutable GitHub job below and retained agent tool output are the provenance. Signing timestamps are not observation timestamps.

The first failure is `protected external gate worker failed: requirements active graph evidence source` at 2026-10-08T14:17:52.0103438Z in [run37791242237/job113358967129](https://github.com/Kaichen9527/stockinsider/actions/runs/37791242237/job/113358967129). Bootstrap succeeds, but the trusted base graph is not registered. Main remains `169aad1b6cfa747f78ae3464b614f43c0749d806`; its model-oracle listing hash `fafab4f391e8bc077a0e2ec7ed10d1f4afc02bfbc77006ccdb436640e5e77161` has no authorized successor in the inspected worker map. Exact-review evidence refs for the five inspected subjects (PR288/311/314/317/318) are absent. An online runner and repository admin access do not satisfy this gate; ruleset bypass is never.

The existing public installation manifest at `/Users/kaerchen/Library/Application Support/StockInsiderRuntime/current/installation-manifest.json` has SHA-256 `6978c157bed4e241fb7d15b3fec11b2863f8c18b48c14bf8ea808f765d33549c`. It belongs to the auth-source worker `741dbca0edefe71785b53184963e01952b4c2ff9`. Its scope cannot be reused as protected host recovery authority.

The current native file at `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex` was read without execution: SHA-256 `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`, size246046384, device16777232, inode207443910. It differs from the candidate1d92 pin. Codesign metadata reports OpenAI Team2DC432GLL2; complete signature/Gatekeeper verification and a version execution were not performed. The old packet therefore cannot simply be signed and installed for this new binary.

## Known facts versus missing authority

Five of the 24 installation fields are knowable immutable Git proposal facts, rather than unknown secrets:

| Field | Proposal value |
|---|---|
| controlPlaneCommit | `b1d96eb96156d3e1394615bb32c7a2d7ef90b661` |
| controlPlaneTree | `13ccd9cc662c73b64535cfd378ff514357cee5e1` |
| plannerSha256 | `6a4828805d6548b21d464f15d49750f985d29f0146f8d7aa1c6c3b7ef9427d53` |
| packetVerifierSha256 | `79cbe3dac6356aa658ef3eb6b2e8a70c0c7d9a0d15bed1756eee1c39e41e1ac8` |
| protectedWorkflowSha256 | `a9573672c1e56833e5f59ae98d33eea5755d5cee9eb36231919b4e592be9d286` |

The newer protectedWorkerSha256 proposal is `0906ca3c1cbcac003f0708fd753ec0726874e57a5d68282bd051ca6bd2a2b68c`. None proves an installed or authorized control plane.

Bundle/manifest hashes can be produced after a real deployment contract is established. Observed runner/auth-source installation paths cannot stand in for recovery paths. A recovered base does not exist yet. The actually missing contract includes the recovery authority/entrypoint, independent public review registry and provenance, authenticated graph/registry write scope, atomic installation and durable CAS/ledger protocols, and permission principal/receipt. No valid entrypoint was found in this bounded inspection.

The concrete external handoff is the established recovery entrypoint reference plus owner/three-reviewer public registry/provenance and permission scope for the base graph, successor and exact-review refs. If that authority has never been established, its bootstrap must first be explicitly designed, reviewed and authorized; another generic planner or fabricated evidence ref cannot repair it. VM implementation and isolated acceptance continue independently. This observation does not withdraw the human's existing task authorization or request it again.

# Post-clean VM delivery — partial, no release approval

PR384 remains draft: https://github.com/Kaichen9527/stockinsider/pull/384 . Base `93e44475cbb0c27beb26e4dcb68e382096a4e212`, branch `codex/stockinsider-vnext-oct22`, source `1ac92cb23b55b95d7c138da57a59f536a50dda36`. [VN01–VN20](CURRENT.json) is the current acceptance matrix. [Evidence receipt](post-clean-evidence/receipt.json) SHA256 `3465c0df6be29b15325b0c6ecb338330692e96892c36d93a9ef498af94a2e356` binds explicit public-safe files. Private128 selected artifacts/5,444,678bytes are hash-inventoried; PGdata directories remain retained and are not represented as fully inventoried or independently reviewed.

## Authorized cleanup and capacity

Only verified task-owned generated compiler-cache contents and exact unused/settled test-container runtimes were removed. The initial empty container was never started, PID0, SizeRw0 and diff empty. Later removed runtimes had settled tests; all bind data/PGdata, anonymous volumes, images, source, Git, WIP, RED and receipts remain. `docker rm` used neither force nor volume deletion. The tools-only container PID1sleep required stop timeout/exit137; this is not described as a PG shutdown. Initial workspace8,517,922,816bytes rose to9,809,031,168 after the first378,839,040byte generated-cache and912,257,024byte empty-runtime cleanup. Subsequent temporary lab allocations/releases are separately recorded, not summed as extra reclaimed original capacity. No additional cleanup is authorized automatically.

Latest observed workspace8,894,779,392/tmp17,333,522,432bytes. Original8,589,934,592 floor remains perfilesystem. Fresh image clone reference912,297,984 plus128MiB exceeds current workspace margin, so another fresh clone is **not admitted**. The bounded retained-lab continuation used no clone/reinstall and monitored its original floor continuously; no recorded resource violation. Sampled own process RSS is not instantaneous peak or totalhost memory; PG had a separate1GiB hard cap. All remaining container/data/volumes are retained.

## Actual commands and outcomes (independent scopes, never summed)

| Receipt label | Actual command/scope | Outcome |
|---|---|---|
| ir-source-direct-01 / ir-source-type-01 | Node22 strip-types preparation-authority; TS5.9.3 |14PASS / typesPASS |
| post-clean-ir-build-permissions-o23 | `cd web && npm run build -- --webpack` |PASS; initial sandboxzero-childstdout RED preserved; unchanged Next helper returned valid JSON with normal VM childprocess permissions |
| post-clean-ir-lint-o23 | `cd web && npm run lint` |PASS,33 inherited warnings |
| worker-ci-repro-o23 | Node22 original `scripts/vnext-worker-postgres.test.mjs`, genuine captured prerequisite PG17.11 |7PASS; sealed9e17 worker inputs, IRdirty files outside12inputs; no liveprovider |
| product-pg-tools-o23 | Original `test:evidence-recovery` with actual pinnedPG17tools |43PASS; no UbuntuPG16 equivalence asserted |
| product-runtime-runtime-o23 | Original runtime test group |235PASS/1SKIP due incorrect existing Arelle launcher path |
| product-runtime-arelle-o23 | Original Arelle adapter with corrected already-installed launcher `/workspace/.tools/vnext-parser-o22/python` |4PASS/0SKIP; previousskip preserved |
| product-runtime-contracts-native-o23 | Original complete migration-contract group, actualPG17tooling, serial |44PASS |
| ir-native-o23 | New full IR candidate on7751f519, realservice_role/observer |0PASS2FAIL; installerCOMMIT component, subsequentmetadata OIDscalar/array codec assertionRED; healthybusinessNOT_RUN |
| ir-continuation-monitored-o23 | Closed retained-lab audit at2600d7f |0PASS2FAIL; empty ACL array metadataquery22023; no businesswrite |
| ir-continuation-monitored-02-o23 | Same retained lab, changedquery at1ac92cb |2PASS2FAIL; actual rights audit/denialsPASS, originalreceipt/parserprefixCOMMIT, validation42704. No worker/publication/revocation reached |
| source-ci-current-o23 | Exact ordinary source-step commands |Earlier10suitesPASS; research-failure4PASS2FAIL, actual missingloaderdependency |
| research-failure-loader-fixed-o23 | Same actualstore tests; only actualcodec dependency added to closedloader |6PASS; no oracle/guard change |
| source-ci-tail-fixed-o23 | Businessvectors; ownedlease route; `npm --prefix web run typecheck` |2PASS /9PASS /typesPASS separate groups |

Outerhost attempts lacking `initdb` remain original REDs (including39PASS4FAIL source-contract attempt); actualPGtool runs above are separate evidence, not rewrites. All exact commands/times/resources live in [resources](post-clean-evidence/resources.json); safe TAP and full table count/hash witness are bound by the receipt. Node22.14 SHA1abce237…380a1; PG17.11 pinnedimage858bb5e9…80d27. No dependency locks or original pins changed.

## Actual financial prerequisite gap

The original `record_official_financial_validation` reached realservice_role SQL and ReadyForQueryI, then rejected42704: `public.financial_validation_status_v3` does not exist. Source v10 line612 casts to that absent enum. The facts table uses checked text; historical20260912_02 repair documents it but also contains ALTEROWNER/REVOKE, so it was **not applied** merely to pass. Actual receipt/parser/fact-prefix rows remain; no vNext job/providerinvocation/publication was created. A new separately reviewed compatibility body candidate is VM code work, not an externalTCP blocker. No enum, grant, profilehash or expected value was invented.

The retainedworker11 clients trulysettled/priorbackends absent; PG shutdown and Docker exited0/PID0 observed after each continuation. Container/socket/PGdata paths remain intentionally retained, not claimed absent. Originalzombies/history are untouched.

## CI and remaining acceptance

Observed808d source-led run39875575448: product-runtime120160235003 and diagnostic120163263603 **success**. vnext-quality39875575447 failed at sourcecontracts/types/lint, all latersteps skipped. Signedlogs403 remainunavailable; VM found the reproducible closedloader omission. New1ac push triggers independent normalCI; no success is inferred. Protectedroot39875570528 stillfailed; exactpins/guards unchanged. No consumedrun rerun/dispatch/merge/deploy.

RemainingVM work: separately guarded financialvalidation compatibility, fullhealthyIRsource/revocation, trusted comparable28day sourcecoverage/volume producer, structuredsource-bound catalyst/contra/target producer, explicitnumericforecast/valuation inputs, and financialpreparation uncertainty reconciliation. Unknown data staysnull/gap. Actualtwo-postclose-session rotation and liveprovider/source/independentsemantic/formalarticles remainNOT_RUN. Desktop/mobile history belongs to its earlier exactsubject, not newIRnative approval.

Owner-only external tasks remain grouped: HTTPpolicy publication where needed; platform grant only5.104.83.211/32TCP22; trusted hostkey and a new explicitly authorized nonexpired scopedidentity; genuine Contabo service/DB/queue/storage separation with originalcapacityguards. No TCP/keyretry, Mac access, productionwriter/data/service, pausedscheduleresumption, DDone-shot or terminalPR370–382 operation occurred. This report authorizes no cleanup, merge or production deployment.

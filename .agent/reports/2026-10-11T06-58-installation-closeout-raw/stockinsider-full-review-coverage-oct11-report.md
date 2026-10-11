# main → 1a full-review coverage inventory（unsigned；非完整 CODE verdict）

Base `169aad1b6cfa747f78ae3464b614f43c0749d806`；head `1a0043f2656b63d54062224d1befeab761f554a3`；tree `548ec17b1d8801ecb7f2e4c5635199aacd9989b2`。只讀 Git 與既有 review metadata；沒有重跑大套、讀 secrets、修改 repo、建立 protected 證據或開始新的模型 provider。

## 已證實的可重用基礎

1. PR284 原生獨立 review 明確 ACCEPTED 整段 `169aad1b6cfa747f78ae3464b614f43c0749d806..54a45ef7095d61e928b7e23bcd0d8961a505acee`，P0/P1/P2=0。原始來源：https://github.com/Kaichen9527/stockinsider/pull/284#discussion_r4110740313 （review5325215908）。本次以 GitHub API 原始回覆確認 commit_id/original_commit_id 與 review 內文；不只引用 root 摘要。API 回覆保存在同 prefix 的 `-284-native-inline.json` / `-284-native-review.json`。
2. 舊 review 的 build 因 next 缺失未執行；沒有保護 gate、31-path study、financial coverage、merge/deploy/publication/investment 批准。可重用的是 exact CODE scope。
3. PR284→目前共有464個 diff path 的最終 blob 相同，其中443個屬粗 source 分類。舊445個 source 中只有 `web/src/lib/candidate-research.ts` 與 `web/src/lib/research-v2.ts` 被改；這兩個不能承接原完整檔案批准。
4. PR287 的 `docs/operations/2026-10-04/implemented-code-review.json` 綁 f2e711e0594c49836c44daf16280f838590e001a/treebd45f435a809a74e1f0d2a97be6a03f98e4332c1，reviewer astra_recovery_oct04、unsigned implemented_code_scope、3 successor +77 prior tests。**沒有明列完整 base**。目前 GitHub PR287 head21d3b2cd57c8b7fd4fcce25cd774070a75149b89，native reviews/comments查詢皆0；因此不能把該本機歸屬紀錄升格為 PR284..PR287 的原生全段 review。PR284..f2共75個粗source；46個目前blob相同，僅是可重用 scoped 材料候選。
5. `openspec/changes/research-first-publication-v2/tasks.md:97` 明示51a的 full review因usage limit中止，沒有完整 CODE PASS或exact protected ref。後續修復及各slice PASS不能代替這個缺口。

## 實際工作量與資料類型

| 分類 | paths | 處理方式 |
|---|---:|---|
| 全 diff | 1707 | 逐path已列inventory |
| 粗 source/tests/config | 743 | 此數字不等於743份程式 |
| 同 PR284 blob | 443 | 重用原 CODE review，補新 consumer／跨模組影響 |
| 其中生成研究 reports/results | 343 | 223 current-editorial/reports +120 tw-strategy-lab/results；全部同PR284，不再逐行重審 |
| 其中其他程式／測試／設定 | 100 | blob證明重用；不得免除新import/ACL/caller邊界 |
| 剩餘 source/tests/config | 300 | 下列7組，含大量已有scoped review的程式，並非300全無review |
| 粗 evidence/docs/spec | 964 | 以索引/來源/承諾邊界核對，不重讀全部raw |
| 上列中實際 runtime docs | 20 /907264bytes | 全部bytes/SHA對上 runtime inventory；必須併B、D、F審查 |

生成產物約87669+11986新增行不能膨脹為程式審查量。反之 runtime docs、schema JSON、SQL、workflow、package/lock 與執行fixture仍具安全意義。完整path/blob與分類在 `-inventory.json`；本表各層有包含關係，不相加。

## 最小可分派清單（尚未派新worker）

| 組 | paths | 建議責任 | 必查整合缺口 |
|---|---:|---|---|
| A 來源、權限、候選池與 observed/insider admission | 69 | source/data security reviewer | 來源權限、SSRF/clock、unknown publication不錯失公司候選；observed不升formal；游標/撤回/同源獨立性；跨source-sync/priority/insider閉合 |
| B 財務、完整輸入與計算口徑 | 32 | financial/input correctness reviewer | 20個runtime docs中的財務輸入、完整mapping與calculator fingerprint/manifest、period/unit/group-owner/NCI、shareddeadline/FD/原lease、手動假設不升verified |
| C 作者／審查者、配額、execution 與 private 結果 | 82 | author/reviewer auth + SQL reviewer | currentcredential role rotation、originalowner/claim、global1/1800/7200、RC fence/並發、單一invocation、作者結果→handoff→review completion、無真模型證據誇稱 |
| D 發布、outbox、共享 reader 與 UI | 33 | publication/reader security reviewer | outbox→atomic publication→source fence→view/UI，一次提交/replay/撤回/response loss，工作稿不冒充published/qualified，公開projection不漏私有lineage |
| E 技術監測、資格、策略與 paper | 34 | technical/strategy governance reviewer | benchmark61sessions/preciseclock/officialcalendar、門檻與releaseidentity、heldrisk/紙上交易、shadow不得默默採用、跨資格與真實inputs |
| F 安裝、打包、CI、依賴與測試運輸 | 45 | installer/release/dependency reviewer | 18successor/原48、固定catalog/ownerACL/RLS/trigger/membership、first-install、peer/protected前置；package/lock/workflow/20runtimefiles與standalone cwd；測試不越權 |
| G 共享入口與整合邊界 | 5 | integration reviewer / coordinator | 兩個已改舊module+internal-auth+ingestion+agentroute test；逐一核對其他6組接線與legacy path，不以scoped串接代完整結論 |

這是可重用的責任分割，並不要求7個同時存在的新agent。原指定reviewer可順序承接；SQL/auth與整合須有明確主責。每個剩餘path僅分到一組，runtime docs另列共享檢查清單。

## 可重用 scoped 材料與可信程度

- **原始可直接讀的完整review**：PR284上述原生inline。
- **tracked attributed scoped紀錄**：下列Oct05 JSON皆含reviewer/head/base或guardBase/scope及限制；inventory保留原JSON、exactdiff path、目前相同/變更blob清單。這些不是原生全range approval。若head不在final ancestry或currentblob已變，不能直接抵扣。

- `docs/operations/2026-10-05/cloud-controller-independent-review.json`：`ba11c326555314fbe69f19116e2970cf244e0ff5` → `72e54dcf1e1df78b48401d574e76d3a31709c629`；head在final ancestry=True；該scope目前相同blob 2/6。原scope及限制見JSON，不以這個比值代表semantic coverage。
- `docs/operations/2026-10-05/deep-work-consumer-independent-review.json`：`7c05e7c6bdc491dad4671b0341c384d35fed0c07` → `139f6efe5e564db609115aba2e3a81dec51dbbc7`；head在final ancestry=True；該scope目前相同blob 6/14。原scope及限制見JSON，不以這個比值代表semantic coverage。
- `docs/operations/2026-10-05/discovery-price-independent-review.json`：`54edb2cdf04498914446229b451ee2d96810d3a4` → `23dffca8633f0ccfc799d45b47b4ad29dea54124`；head在final ancestry=True；該scope目前相同blob 2/10。原scope及限制見JSON，不以這個比值代表semantic coverage。
- `docs/operations/2026-10-05/discovery-supplement-independent-review.json`：`23dffca8633f0ccfc799d45b47b4ad29dea54124` → `9cce0516f73ad81a1497d4a9278a9b9d77c118d3`；head在final ancestry=True；該scope目前相同blob 4/8。原scope及限制見JSON，不以這個比值代表semantic coverage。
- `docs/operations/2026-10-05/financial-history-independent-review.json`：`3b448b44674dd681b41c03f6c6fdd4af8d87167e` → `6899996a8e3006425bf5bc54777b90e6b0c51cc3`；head在final ancestry=True；該scope目前相同blob 9/16。原scope及限制見JSON，不以這個比值代表semantic coverage。
- `docs/operations/2026-10-05/industry-article-citation-independent-review.json`：`37fd47e3f5b040df4cb7d4e846004d3533eb8865` → `98b9a76735dc236abd0e330433570f93b044f9a4`；head在final ancestry=True；該scope目前相同blob 7/11。原scope及限制見JSON，不以這個比值代表semantic coverage。
- `docs/operations/2026-10-05/industry-association-independent-review.json`：`62d9d9aaa7c45a802dee3270a6e60ccfe84e67f9` → `970b05215c84166c2fb394f37e88dad46cd395f2`；head在final ancestry=False；該scope目前相同blob 3/7。原scope及限制見JSON，不以這個比值代表semantic coverage。
- `docs/operations/2026-10-05/industry-source-independent-review.json`：`39436ce56e78521203ee10b7ca61811a3cff5cd2` → `62d9d9aaa7c45a802dee3270a6e60ccfe84e67f9`；head在final ancestry=True；該scope目前相同blob 4/6。原scope及限制見JSON，不以這個比值代表semantic coverage。
- `docs/operations/2026-10-05/monitor-transport-independent-review.json`：`473606ac694e387e6f50155e7040a52669914af6` → `3aa8710732f301e3daf6cb4af24cb61524e85ffa`；head在final ancestry=True；該scope目前相同blob 7/17。原scope及限制見JSON，不以這個比值代表semantic coverage。
- `docs/operations/2026-10-05/recovery-proposal-independent-review.json`：`e94d21f9fe05dc436211a2458ea59adb52195e26` → `73e0aed1b6303c0fc4470b85d751717d225d0fa4`；head在final ancestry=False；該scope目前相同blob 0/7。原scope及限制見JSON，不以這個比值代表semantic coverage。
- `docs/operations/2026-10-05/schema-independent-review.json`：`75d0752ffb31a9b51cc072e4b6b35232779fdbee` → `56b244a3759904d73e699a469ef0f44ec783c8ce`；head在final ancestry=True；該scope目前相同blob 6/13。原scope及限制見JSON，不以這個比值代表semantic coverage。
- `docs/operations/2026-10-05/source-controller-independent-review.json`：`61a2fad322f6878daaea11a1a8c805a329abfce5` → `75d0752ffb31a9b51cc072e4b6b35232779fdbee`；head在final ancestry=True；該scope目前相同blob 6/12。原scope及限制見JSON，不以這個比值代表semantic coverage。
- `docs/operations/2026-10-05/strategy-artifact-independent-review.json`：`c734d97ce4fff124a7928769af1b4e9bae4adf03` → `9b6cb4d9d8716060eb12d3d8cb7374b845872857`；head在final ancestry=True；該scope目前相同blob 3/5。原scope及限制見JSON，不以這個比值代表semantic coverage。

後續v2可查本指定reviewer既有對話／tracked checkpoint：financial59aea2a1837c3e76f6af4e9a3b062d2f26de41fe（fa35修復後）、article7221958b5b3de77134f3df816376e52fba9ec6c5、assignmentfa3edca89fc3dde1cd06cb5ccb55b6b4714f4ed5/route4eb3f53f3ff852b0b2ee81d9d4a157d9ffa5ab0c、packetcbd1a9e93ae77930684f0ca45726790b6871721c、resultb8c3df4d1c21b4aeee28341b6935302b42463f94、handoff492729b349b4ffa6e6a28f9603de30e7ec9fba3e、reviewassignment7f6259e8、reviewresult9136a09a；另原子發布18d6c86ffabfa0fc88c6f0ed807a860024d0f144、view27f13e51fca5d64498b5ef54d4f9e5394e0f7f21有其他指定reviewer的scoped紀錄。**本次未重新取得每一份原對話的可攜原始訊息ID/base；不能把這段名單当成完整coverage證明。** 下一輪每組先取既有review正文並比最終blob，缺原證據就補review。

可定位文件：`docs/operations/2026-10-09/integration-manifest.json`（當時independentIntegrationReview=false）、`integration-financial-27d-manifest.json`（40incoming/38exact，另2conflict）、financial/complete-input/observed-priority/attention-shadow/podcast handoffs，以及 `openspec/changes/research-first-publication-v2/tasks.md`。這些有助定位，不能把maker manifest自稱等於獨立結論。

Native/VM收據（如75cc publication94/94、7f82 reviewer HTTP94/94、f8dacf transport與PG、e882 integration、ba569 atomic、c676 view）先查來源/測試/compiled identity與原RED保留的既有獨立核對；不要將合成roles/prose或partial schema重述為genuine model、完整production或publication資格。本次未bulk重讀raw。

## 51a → 1a：最終33個source path已具窄範圍材料

- `51a80cbaa1bbe719794ce9ca400532bc48cb1c58` → `4ff224baa6e00e73198d9f2cc8b29b2045374744`。
- `436113460493c7132f81d22023bd90f8a338a4ac` → `2f74c1eeb1c21af32884903f38590da9cc70f668`。
- `df17b37c881b866cb4df6623101fd078f7d31eec` → `5e3ee67bc2afe07ac7653743d227318aed77f6d8`。
- `5e3ee67bc2afe07ac7653743d227318aed77f6d8` → `887355ca0479d957d9b0472bba70ea4f8f9d5961`。
- `bc01c006cba307735ccd50c78841b94242e1c014` → `1a0043f2656b63d54062224d1befeab761f554a3`。

機械驗證33/33最終blob都等於至少一個上述已審scope的該檔blob，沒有漏掉post51a source path。但這不證明跨scope組合安全；主責仍須核對SQL/installer/prerequisite、sharedreader/CLI/package的整合。
原始定位：4ff/2f在tasks release-convergence checkpoint；887在 `.agent/reports/2026-10-11T04-49-admission-attributes/independent-review.md`（明示attributed/unsigned且未封reviewer raw）；1a是本指定reviewer原獨立結論，原22/22 log `/tmp/stockinsider-installer-independent-oct11-1a0043f-regression.tap` SHAbaafb10556580629615dacdb7c443a0c5a8bb773ea31f3c42ec8c494686355d8，report JSON SHA141a78244413cee3bc2d85c4244efee31d2c9e1f084418a46d8ddb7c0ae728be。

## 下一輪可執行順序

1. 凍結main169..1a/tree548ec；沿用PR284 exact443 blob的舊獨立 CODE review。逐行重讀相同443份沒有必要，但新consumer對舊介面的使用仍屬本輪。
2. 按A→B→C→D鏈確認來源、完整輸入、角色、預算與原子發布；E並行或其後查資格/技術界線；F使用已審1a installer材料核完整部署依賴/資源/打包和不可變授權界線。每組先用inventory對原scope與finalblob，比較未覆蓋delta後補完整責任範圍；不能只加總測試數。
3. G整合主責核兩個變更舊module、internal-auth與ingestion所有callers，確認formal/observed、public/private、current/replayed、active/completed/withdrawn、authn/principal、SQL隔離/ownerACL、release/codeHash/package/deps的跨組假設一致。
4. 資料/evidence主責核20runtime輸入、其餘研究產物的來源/consumer/公開邊界，檢查文件聲稱與程式能力一致。343原reports/results沿用舊review；964doc/evidence不全文複讀，只對新可執行參照、source hashes、receipts歸屬與失敗保留做索引抽查/必要深入。
5. 真正full-range reviewer彙整上述實際結果，明列仍未covered path/邊界與P1/P2後，才可下新的main..1a CODE verdict。Root新PCR155/155與VM驗收可作test evidence，不能代替獨立CODE review；本次僅收到PCRlogSHA c3b5e49b2135ec7e3f9b55208854349fa1240e9c66dc7415ed3ac6e22d70b608的root通報，沒有重跑或独立核raw。
6. Protected evidence/authority、真作者與独立reviewer工具執行、正式publication/deployment/策略批准保持各自前置。即使後續full CODE PASS也不自動完成這些條件。

## 精確path分組（300個，無重複）

### A 來源、權限、候選池與 observed/insider admission

- `migrations/20261008_insider_snapshots_v1.sql`
- `migrations/20261008_research_observed_claim_v2.sql`
- `migrations/20261008_research_observed_priority_v1.sql`
- `migrations/20261008_research_observed_roster_v1.sql`
- `scripts/research-discovery-relay-prepare.mjs`
- `scripts/research-discovery-relay-prepare.test.mjs`
- `scripts/research-insider-acceptance-lifecycle.mjs`
- `scripts/research-insider-acceptance-lifecycle.test.mjs`
- `scripts/research-insider-collector.test.mjs`
- `scripts/research-insider-command-input.test.mjs`
- `scripts/research-insider-continuation-command.mjs`
- `scripts/research-insider-continuation.mjs`
- `scripts/research-insider-continuation.test.mjs`
- `scripts/research-insider-cursor-postgres.test.mjs`
- `scripts/research-insider-dataplane.test.mjs`
- `scripts/research-insider-guarded-http.test.mjs`
- `scripts/research-insider-health-route.test.mjs`
- `scripts/research-insider-journal-linux.test.mjs`
- `scripts/research-insider-snapshot-postgres.test.mjs`
- `scripts/research-insider-snapshot.test.mjs`
- `scripts/research-local-inbox-dataplane.mjs`
- `scripts/research-local-inbox-dataplane.test.mjs`
- `scripts/research-observed-priority-native.test.mjs`
- `scripts/research-observed-roster-native.test.mjs`
- `scripts/research-saved-observation.test.mjs`
- `scripts/research-source-controller.mjs`
- `scripts/research-source-controller.test.mjs`
- `scripts/research-source-priority-consumer.mjs`
- `scripts/research-source-priority-consumer.test.mjs`
- `web/src/app/api/internal/research-observed-roster/route.ts`
- `web/src/app/api/internal/research-priority-run/route.contract.test.ts`
- `web/src/app/api/internal/research-priority-run/route.ts`
- `web/src/app/api/internal/source-sync/route.ts`
- `web/src/lib/insider-completed-archive-codec-v2.test.ts`
- `web/src/lib/insider-completed-archive-codec-v2.ts`
- `web/src/lib/insider-completed-archive-io-v2.test.ts`
- `web/src/lib/insider-completed-archive-io-v2.ts`
- `web/src/lib/research-agent-priority.test.ts`
- `web/src/lib/research-agent-priority.ts`
- `web/src/lib/research-attention-shadow-v2.test.ts`
- `web/src/lib/research-attention-shadow-v2.ts`
- `web/src/lib/research-discovery-evidence.test.ts`
- `web/src/lib/research-discovery-evidence.ts`
- `web/src/lib/research-discovery-price-enrichment.test.ts`
- `web/src/lib/research-discovery-price-enrichment.ts`
- `web/src/lib/research-inbox.test.ts`
- `web/src/lib/research-inbox.ts`
- `web/src/lib/research-insider-evidence.ts`
- `web/src/lib/research-insider-official.test.ts`
- `web/src/lib/research-insider-official.ts`
- `web/src/lib/research-insider-snapshot.ts`
- `web/src/lib/research-observed-classifier.mjs`
- `web/src/lib/research-observed-deep.test.ts`
- `web/src/lib/research-observed-priority.test.ts`
- `web/src/lib/research-observed-priority.ts`
- `web/src/lib/research-observed-roster.test.ts`
- `web/src/lib/research-observed-roster.ts`
- `web/src/lib/research-public-relay.test.ts`
- `web/src/lib/research-source-association.test.ts`
- `web/src/lib/research-source-association.ts`
- `web/src/lib/research-source-attempt-controller.test.ts`
- `web/src/lib/research-source-attempt-controller.ts`
- `web/src/lib/research-source-extensions.test.ts`
- `web/src/lib/research-source-registry.ts`
- `web/src/lib/research-source-roots.test.ts`
- `web/src/lib/research-source-roots.ts`
- `web/src/lib/source-health.test.ts`
- `web/src/lib/source-health.ts`
- `web/src/lib/source-policy.ts`

### B 財務、完整輸入與計算口徑

- `migrations/20261005_financial_history_admission_v1.sql`
- `migrations/20261009_research_complete_input_v2.sql`
- `migrations/20261009_research_input_preparation_assert_v2.sql`
- `migrations/20261009_research_input_preparations_v2.sql`
- `scripts/candidate-financial-document-write-lease-route.test.mjs`
- `scripts/candidate-financial-queue-write-lease-route.test.mjs`
- `scripts/research-auo-four-segment-model.test.mjs`
- `scripts/research-business-calculator.test.mjs`
- `scripts/research-complete-input-boundary-postgres.test.mjs`
- `scripts/research-complete-input-http.test.mjs`
- `scripts/research-complete-input-postgres.test.mjs`
- `scripts/research-complete-input.test.mjs`
- `scripts/research-emc-company-model.test.mjs`
- `scripts/research-financial-cleanup.test.mjs`
- `scripts/research-financial-supplement.test.mjs`
- `scripts/research-input-preparation-postgres.test.mjs`
- `web/src/app/api/internal/candidate-financial-documents/route.ts`
- `web/src/app/api/internal/candidate-financial-documents/worker/route.ts`
- `web/src/app/api/internal/candidate-financial-queue-drain/route.ts`
- `web/src/lib/research-broker-estimate.test.ts`
- `web/src/lib/research-broker-estimate.ts`
- `web/src/lib/research-business-calculator.ts`
- `web/src/lib/research-complete-2383.schema.json`
- `web/src/lib/research-complete-2409.schema.json`
- `web/src/lib/research-complete-canonical.ts`
- `web/src/lib/research-complete-input.ts`
- `web/src/lib/research-complete-mapping.json`
- `web/src/lib/research-complete-schema-bundles.ts`
- `web/src/lib/research-financial-clock.ts`
- `web/src/lib/research-financial-file-reader.ts`
- `web/src/lib/research-financial-inventory.ts`
- `web/src/lib/research-financial-supplement.ts`

### C 作者／審查者、配額、execution 與 private 結果

- `migrations/20260929_research_agent_state_v1.sql`
- `migrations/20260929_research_deep_jobs_v1.sql`
- `migrations/20261004_research_cloud_receipts_v1.sql`
- `migrations/20261009_research_author_assignments_v2.sql`
- `migrations/20261009_research_author_handoffs_v2.sql`
- `migrations/20261009_research_author_packet_v2.sql`
- `migrations/20261009_research_author_results_v2.sql`
- `migrations/20261009_research_reviewer_assignments_v2.sql`
- `migrations/20261009_research_reviewer_results_v2.sql`
- `migrations/20261011_research_admission_isolation_v1.sql`
- `scripts/fixtures/research-cloud-article.ts`
- `scripts/lib/research-model-article.mjs`
- `scripts/research-admission-isolation-postgres.test.mjs`
- `scripts/research-author-assignment-fixture.sql.mjs`
- `scripts/research-author-assignment-http.test.mjs`
- `scripts/research-author-assignment-postgres.test.mjs`
- `scripts/research-author-assignment-route.test.mjs`
- `scripts/research-author-handoff-postgres.test.mjs`
- `scripts/research-author-handoff.test.mjs`
- `scripts/research-author-packet-fixture.mjs`
- `scripts/research-author-packet-postgres.test.mjs`
- `scripts/research-author-packet-route.test.mjs`
- `scripts/research-author-packet.test.mjs`
- `scripts/research-author-result-fixture.mjs`
- `scripts/research-author-result-postgres.test.mjs`
- `scripts/research-author-result.test.mjs`
- `scripts/research-business-article.test.mjs`
- `scripts/research-capacity-admission.mjs`
- `scripts/research-capacity-admission.test.mjs`
- `scripts/research-cloud-capacity.mjs`
- `scripts/research-cloud-capacity.test.mjs`
- `scripts/research-cloud-controller.mjs`
- `scripts/research-cloud-controller.test.mjs`
- `scripts/research-cloud-receipts-postgres.test.mjs`
- `scripts/research-cloud-result-route.test.mjs`
- `scripts/research-cloud-work-cli.test.mjs`
- `scripts/research-cloud-work.mjs`
- `scripts/research-deep-controller.mjs`
- `scripts/research-deep-controller.test.mjs`
- `scripts/research-deep-draft-controller.mjs`
- `scripts/research-deep-draft-controller.test.mjs`
- `scripts/research-deep-job-context-route.test.mjs`
- `scripts/research-deep-jobs-postgres.test.mjs`
- `scripts/research-execution-binding.test.mjs`
- `scripts/research-insider-capacity-witness.test.mjs`
- `scripts/research-reviewer-assignment-postgres.test.mjs`
- `scripts/research-reviewer-assignment.test.mjs`
- `scripts/research-reviewer-identity.test.mjs`
- `scripts/research-reviewer-result-fixture.mjs`
- `scripts/research-reviewer-result-http-fixture.mjs`
- `scripts/research-reviewer-result-http-readiness.mjs`
- `scripts/research-reviewer-result-http.test.mjs`
- `scripts/research-reviewer-result-postgres.test.mjs`
- `scripts/research-reviewer-result.test.mjs`
- `scripts/research-source-budget-postgres.test.mjs`
- `web/src/app/api/internal/research-cloud-result/route.ts`
- `web/src/app/api/internal/research-deep-job/route.ts`
- `web/src/app/api/internal/research-deep-review/route.ts`
- `web/src/app/api/internal/research-model-reservation/route.ts`
- `web/src/lib/research-author-assignment.ts`
- `web/src/lib/research-author-handoff.ts`
- `web/src/lib/research-author-packet.ts`
- `web/src/lib/research-author-result.ts`
- `web/src/lib/research-business-article.ts`
- `web/src/lib/research-cloud-work.test.ts`
- `web/src/lib/research-cloud-work.ts`
- `web/src/lib/research-deep-article.test.ts`
- `web/src/lib/research-deep-article.ts`
- `web/src/lib/research-deep-author-input.ts`
- `web/src/lib/research-deep-claim-context.test.ts`
- `web/src/lib/research-deep-claim-context.ts`
- `web/src/lib/research-deep-draft.ts`
- `web/src/lib/research-deep-evidence.ts`
- `web/src/lib/research-deep-source-rights.test.ts`
- `web/src/lib/research-deep-source-rights.ts`
- `web/src/lib/research-editorial-review.ts`
- `web/src/lib/research-execution-binding.ts`
- `web/src/lib/research-execution-context.test.ts`
- `web/src/lib/research-execution-context.ts`
- `web/src/lib/research-review-auth.test.ts`
- `web/src/lib/research-reviewer-assignment.ts`
- `web/src/lib/research-reviewer-result.ts`

### D 發布、outbox、共享 reader 與 UI

- `migrations/20260929_candidate_dossier_outbox_v6.sql`
- `migrations/20261009_research_publication_lineage_v2.sql`
- `migrations/20261009_research_publication_source_fence_v2.sql`
- `migrations/20261010_research_atomic_publication_v2.sql`
- `migrations/20261010_research_publication_view_v2.sql`
- `scripts/candidate-dossier-outbox-v6-postgres.test.mjs`
- `scripts/research-atomic-publication-postgres.test.mjs`
- `scripts/research-atomic-publication.test.mjs`
- `scripts/research-deep-publication-postgres.test.mjs`
- `scripts/research-publication-http-drop.mjs`
- `scripts/research-publication-http-drop.test.mjs`
- `scripts/research-publication-http.test.mjs`
- `scripts/research-publication-lineage-postgres.test.mjs`
- `scripts/research-publication-source-fence-postgres.test.mjs`
- `scripts/research-publication-view-fixture.mjs`
- `scripts/research-publication-view.test.mjs`
- `web/src/app/api/internal/candidate-dossier-bundle/route.ts`
- `web/src/app/api/internal/candidate-dossier-lease/route.ts`
- `web/src/app/api/internal/candidate-dossier-submission/route.ts`
- `web/src/app/layout.tsx`
- `web/src/app/opportunity-v3/page.tsx`
- `web/src/app/preview/research-agent-2409/page.tsx`
- `web/src/app/preview/research-working/[symbol]/page.tsx`
- `web/src/app/stock/[symbol]/CandidateDetailView.tsx`
- `web/src/app/stock/[symbol]/PublishedResearchView.tsx`
- `web/src/lib/candidate-detail.ts`
- `web/src/lib/research-atomic-publication.ts`
- `web/src/lib/research-publication-view-server.ts`
- `web/src/lib/research-publication-view.ts`
- `web/src/lib/research-working-draft-fifo.test.ts`
- `web/src/lib/research-working-draft-loader.ts`
- `web/src/lib/research-working-draft.test.ts`
- `web/src/lib/research-working-draft.ts`

### E 技術監測、資格、策略與 paper

- `migrations/20261004_research_technical_identity_v2.sql`
- `research/tw-strategy-lab/artifact_audit.py`
- `research/tw-strategy-lab/test_artifact_audit.py`
- `scripts/research-approval-replay-route.test.mjs`
- `scripts/research-monitor-controller.mjs`
- `scripts/research-monitor-controller.test.mjs`
- `scripts/research-monitor-progress.mjs`
- `scripts/research-monitor-progress.test.mjs`
- `scripts/research-paper-session-route.test.mjs`
- `scripts/research-strategy-release.test.mjs`
- `scripts/sync-research-strategy-release.mjs`
- `web/src/app/api/internal/research-monitor-worklist/route.ts`
- `web/src/app/api/internal/research-paper-session/route.ts`
- `web/src/app/api/internal/research-strategy-record/route.ts`
- `web/src/app/api/internal/research-technical-snapshot/route.ts`
- `web/src/app/api/internal/research-thesis-event/route.ts`
- `web/src/app/api/internal/research-thesis-review/route.ts`
- `web/src/lib/research-agent-qualification.test.ts`
- `web/src/lib/research-agent-qualification.ts`
- `web/src/lib/research-monitor-benchmark-context.test.ts`
- `web/src/lib/research-monitor-benchmark-context.ts`
- `web/src/lib/research-paper-books.test.ts`
- `web/src/lib/research-paper-books.ts`
- `web/src/lib/research-strategy-governance.test.ts`
- `web/src/lib/research-strategy-governance.ts`
- `web/src/lib/research-strategy-release.generated.ts`
- `web/src/lib/research-weekly-bars.test.ts`
- `web/src/lib/research-weekly-bars.ts`
- `web/src/lib/technical-features-v2.test.ts`
- `web/src/lib/technical-features-v2.ts`
- `web/src/lib/tw-entry-plan-authority.test.ts`
- `web/src/lib/tw-entry-plan-authority.ts`
- `web/src/lib/tw-entry-plan.test.ts`
- `web/src/lib/tw-entry-plan.ts`

### F 安裝、打包、CI、依賴與測試運輸

- `.github/workflows/source-led-opportunity-v3.yml`
- `deployment/vps/research-backtest-budget.json`
- `deployment/vps/research-runtime-files-v1.json`
- `deployment/vps/run-heavy-operation.sh`
- `migrations/20261005_release_function_ownership_bridge_v1.sql`
- `package.json`
- `scripts/cleanup-unused-stockinsider.py`
- `scripts/opportunity-v3/apply-reviewed-migrations.mjs`
- `scripts/opportunity-v3/atomic-migration-chain.mjs`
- `scripts/opportunity-v3/atomic-migration-chain.test.mjs`
- `scripts/opportunity-v3/fixtures/publication-catalog-20261011.json.gz`
- `scripts/opportunity-v3/fixtures/publication-install-README.md`
- `scripts/opportunity-v3/fixtures/vps-schema-20261011.sql.gz`
- `scripts/opportunity-v3/migration-contract.test.mjs`
- `scripts/opportunity-v3/migration-plan.mjs`
- `scripts/opportunity-v3/migration-sql-policy.mjs`
- `scripts/opportunity-v3/migration-sql-policy.test.mjs`
- `scripts/opportunity-v3/migration-successor-guard.mjs`
- `scripts/opportunity-v3/migration-successor-guard.test.mjs`
- `scripts/opportunity-v3/product-correctness.test.mjs`
- `scripts/opportunity-v3/research-publication-catalog.mjs`
- `scripts/opportunity-v3/research-publication-full-chain.test.mjs`
- `scripts/opportunity-v3/research-publication-install-guard.mjs`
- `scripts/opportunity-v3/research-publication-install-guard.test.mjs`
- `scripts/opportunity-v3/research-publication-install-inventory.json`
- `scripts/opportunity-v3/research-publication-install-profile.json`
- `scripts/opportunity-v3/vps-migration-peer.mjs`
- `scripts/opportunity-v3/vps-migration-peer.test.mjs`
- `scripts/package-standalone-release.mjs`
- `scripts/package-standalone-release.test.mjs`
- `scripts/package-vps-standalone.mjs`
- `scripts/release-owner-bridge-postgres.test.mjs`
- `scripts/research-agent-migration-gate.test.mjs`
- `scripts/research-bounded-file.mjs`
- `scripts/research-bounded-file.test.mjs`
- `scripts/research-host-resource-check.mjs`
- `scripts/research-host-resource-check.test.mjs`
- `scripts/research-release-artifacts.mjs`
- `scripts/research-release-artifacts.test.mjs`
- `scripts/research-reviewer-result-psql-child-fixture.py`
- `scripts/research-reviewer-result-psql-transport.mjs`
- `scripts/research-reviewer-result-psql-transport.test.mjs`
- `scripts/test-support/collect-piped-child.mjs`
- `web/package-lock.json`
- `web/package.json`

### G 共享入口與整合邊界

- `scripts/research-agent-routes.test.mjs`
- `web/src/lib/candidate-research.ts`
- `web/src/lib/internal-auth.ts`
- `web/src/lib/opportunity-v3/ingestion.ts`
- `web/src/lib/research-v2.ts`

## 20個runtime input（均已核bytes/SHA對inventory）

- `docs/research/2026-10-08-auo-four-segment-model/article.md` — 21067 bytes
- `docs/research/2026-10-08-auo-four-segment-model/draft-metadata.json` — 1706 bytes
- `docs/research/2026-10-08-auo-four-segment-model/hashes.json` — 1702 bytes
- `docs/research/2026-10-08-auo-four-segment-model/model-results.json` — 88790 bytes
- `docs/research/2026-10-08-auo-full-financial/financial-relay.json` — 19837 bytes
- `docs/research/2026-10-08-auo-full-financial/guidance-relay.json` — 2910 bytes
- `docs/research/2026-10-08-auo-full-financial/historical-income-relay.json` — 40271 bytes
- `docs/research/2026-10-08-auo-full-financial/ownership-relay.json` — 3549 bytes
- `docs/research/2026-10-08-auo-full-financial/technology-context-relay.json` — 6599 bytes
- `docs/research/2026-10-08-auo-market/dataset.json` — 393280 bytes
- `docs/research/2026-10-08-auo/dataset.json` — 86638 bytes
- `docs/research/2026-10-08-emc-company-model/article.md` — 20855 bytes
- `docs/research/2026-10-08-emc-company-model/draft-metadata.json` — 1192 bytes
- `docs/research/2026-10-08-emc-company-model/hashes.json` — 2012 bytes
- `docs/research/2026-10-08-emc-company-model/model-results.json` — 54602 bytes
- `docs/research/2026-10-08-emc-official-evidence/context-relay.json` — 10693 bytes
- `docs/research/2026-10-08-emc-official-evidence/current-media-relay.json` — 3671 bytes
- `docs/research/2026-10-08-emc-official-evidence/financial-notes-relay.json` — 3630 bytes
- `docs/research/2026-10-08-emc-official-evidence/financial-relay.json` — 33734 bytes
- `docs/research/2026-10-08-emc-official-evidence/market-relay.json` — 110526 bytes

# 上線進度：2026-10-11 13:31 台灣時間

目前尚未完成正式上線。已修復可重現的問題並保存失敗資料，沒有繞過保護檢查。

| 範圍 | 最新可驗證成果 | 還缺什麼 |
|---|---|---|
| 一般 CI／打包 | PR359 舊 head e8c 的 product-runtime 與 diagnostic 成功；Linux 打包13/13。新版5e修正 umask 測試條件，Linux六檔81/81與6項PG案例通過，沒有弱化讀取器 | 完整Linux瀏覽器PCR尚未完成；保護gate尚未通過 |
| 原產品正確性 | Mac4ff155/155；Linux原147/155及8個失敗保留。exact5e獨立補跑6個原PG失敗案例6/6成功 | 完整Linux PCR尚未重跑，2個原瀏覽器失敗原因仍未證明；不能把局部補跑當整套通過 |
| 研究工作配額 | 真實雙連線 RR 反例重現；887修正9入口RC guard及函式屬性前置核對。maker21/21、獨立scoped CODE PASS、正常Mac build及Linux21/21成功 | 完整production安裝鏈整合；合成partial profile驗收不能代替正式安裝與發布審查 |
| 文章發布 | 隔離 guarded HTTP／PG94案例與斷線恢復已實作驗證 | 真實可信作者、獨立審查執行及友達／另一產業文章；synthetic fixture不算內容完成 |
| 正式部署 | 凍結整合51a、正式main169維持不動，VPS擴容已實測 | installer缺原17個publication migration加新isolation successor；完整受保護審查及runner信任復原 |
| 策略／排程 | 原模組與失敗紀錄保留 | 完整母體、樣本外／前瞻驗證、使用者批准確切策略、排程及五實際交易日驗收 |

先收斂正式安裝與完整審查兩個發布必要條件，並行完成真實內容交接。來源／候選程式與文章測試完成，不代表已讀完所有平台或已找到有效獲利策略。短期不新增框架。

精確代碼、原始RED、PASS及限制見本次receipt。PR359修補不能直接視為main發布批准；新增隔離修補以獨立PR接續。部署後只保留持久歷史、證據與帳本，無引用可重建暫存才清理，這次沒有新確認可刪VPS項目。


## 工程接續狀態（2026-10-11T05:31:00Z）

- PR359：`codex/research-package-linux-fixture-oct11`，exact5e3ee67bc2afe07ac7653743d227318aed77f6d8。一般CI成功；protected checks未完成。
- PR360：`codex/research-admission-isolation-oct11`，已推送進度與失敗證據；最終code887355ca0479d957d9b0472bba70ea4f8f9d5961已獨立scoped CODE PASS。這是development依賴PR，不是正式main發布批准。
- 既有Cloud聊天「Set up stockinsider」`01a106b8-a883-7185-9962-f7372109a093`／durable已完成這件Linux驗收，最新狀態idle，turn`01a1296c-8f2b-76fc-8a82-79bc1ef86687`、cursor`fb0ce0df-ca49-43e0-99fc-e874b21fb53d:8`。先讀compact狀態再派下一件，避免重複工作。
- 原Linux嘗試1e0c為4PASS/1FAIL/零skip，實際PG startup缺少username；保留31份原始紀錄，未改寫成成功。僅外部runner補入由OS帳戶取得的非秘密USER，exact887程式、SQL、測試、配額與時限均未修改；一次重跑21/21PASS、零skip。這21包含18個nested案例與3個parent，不能另計為21個獨立產品驗收條件。
- 新證據345a284cc7a12a923bc83f98aecc8188ea87138c已由root逐檔核對26raw／17,815bytes及source tree；無新依賴、build、模型呼叫或正式寫入。抽樣峰值RSS約295MB、可用磁碟10.08GB，自有程序已結束。收據`.agent/reports/2026-10-11T05-28-admission-isolation-user-linux-vm.json`，使用合成partial prerequisite profile，並非完整production安裝。
- 下一個發布工程項目是installer完整18-successor清單／first-install／owner-ACL-trigger／rollback契約，依既有獨立migration設計接續，不能只追加路徑或移除TRUNCATE保護。
- 全main-to-final審查與外部runner信任復原仍獨立阻擋；不能用這次bounded21PASS替代。真正作者／獨立審查文章、正式策略與排程驗收維持未完成。


## 完整資料庫安裝鏈接續（2026-10-11T06:45Z）

- 已補入18個遺漏 successor，維持48-file base原始SQL及digest；73個選定檔案實際套用72個，1個由既有superseded檢測跳過。
- 以實際VPS的schema-only dump在隔離PG17完整還原，沒有用stub取代prerequisite。完整安裝、真正最終postcondition、原子回滾、斷線、雙安裝程序競爭與catalog/owner/ACL/trigger/role mutation測試通過。
- 真實執行修復了最終verifier的括號語法、兩個歷史wrapper名稱及owner檢查；release manifest也補上V3.15原始DO-block resolver變更，沒有自動批准新策略。
- 獨立WIP審查另提出2個P2：pgpass回退和把HBA檔案當載入規則。已用拒絕密碼challenge callback、`system_user=peer:postgres`、實際runtime本地HBA拒絕探測及前後profile一致性修復。22/22測試、型別、lint、正常build通過；精確版本獨立複審與Linux新鏈驗證尚待執行。
- VPS唯讀探測確認peer及實際拒絕成立，沒有修改runtime角色或正式schema。舊空間不足不是此次阻擋。
- Cloud244eccba的27raw/44,875bytes逐一核對成功，原始empty-PG schema RED保留；該結果不表示正式VPS缺auth。
- 受保護發布仍缺真正完整main-to-final審查/PCR及trusted runner復原機制；此批安裝測試不會冒充合併/部署批准。具體交接見database-installation-handoff.md與本次receipt。


## 凍結版本與獨立驗證（2026-10-11T06:54Z）

- PR361 source固定1a0043f2656b63d54062224d1befeab761f554a3。後續證據保存至獨立codex/research-installer-verification-oct11分支，避免每份文件紀錄都改動待審程式版本。
- 獨立installer增量審查重跑22/22PASS、零skip，兩項P2已閉合，unsigned scoped CODE PASS。原產品正確性完整命令在同一source另跑155/155PASS、零skip，包含31個PCR acceptance名稱；沒有冒充完整發布批准。
- Linux full-chain驗收已交由既有idle VM單次執行，完成前維持pending。最新protected run38119168980仍缺exact1a review ref；下游code gate為SKIPPED，沒有手動重跑。
- 正在盤點可重用的既有精確審查：443份source blob與已接受PR284版本相同，後續變更需補review及跨模組邊界核對。此盤點本身不是fullreview PASS。


## Linux完整安裝鏈已驗收（2026-10-11T06:58Z）

- Codex VM exact1a安裝八檔22/22PASS、零skip；73選定/72套用/1superseded與三階段catalog通過。types/lint/normalbuild成功；lint33warnings。
- VM證據1b67ee7f：root已逐項驗24raw／454,072bytes、109source hashes與head/tree/webtree，保存至此verification分支。實測抽樣峰值RSS1.32GiB、最低free10.07GB；僅這次有界驗收符合32GB目標，並非全部歷史工作容量保證。
- coverage精確修正：443相同項目中100為非生成程式/設定/測試、343為生成報告/結果；剩餘300paths分成A-D216與F/G/E84，兩個既有獨立角色審查中。20runtime研究輸入另列，不能跳過。
- 既有VM完成且idle後，另啟動單次完整Linux PCR，先補驗可重建且版本鎖定的瀏覽器cache，避免重複已知missing-executable失敗。code1a仍凍結。
- 尚未main合併/production安裝/部署。完整精確審查及可信runner復原維持真正發布條件，沒有用測試數或scoped PASS代替。


## 2026-10-11 release review repairs — exact e0885815

Code source `e0885815b39f86df34763279dc5fc22e54037a40` / web tree `e9d3ae1fdf2ed05017a6ab8ef4fb84a4310adcb1`, PR363 stacked on PR362/361. Main and production remain unchanged. Separate evidence branches preserve exact code identities.

- [x] A–D review coverage completed:216 paths plus20 runtime inputs; F/G/E84 paths completed separately. Frozen1a had7 reproducible P2 findings and remains REQUEST_CHANGES. Reuse is exact-blob/scoped, not a claim that all1707 changed paths are code.
- [x] Implement inbox/association/price microsecond fixes, insider and thesis snapshot-isolation guards, paper historical catch-up authority, and legacy article withdrawal. Preserve generic attention19-digit contract and old failed examples.
- [x] Rebind22-file calculation source closure through an additive mapping successor; preserve financial inputs/schema/assumptions. Rebind execution manifest to guarded thesis function without creating strategy approval.
- [x] Current native15/15zero-skip:76 selected migrations,75 applied plus1already-superseded; actual existing-schema restore, postconditions, ACL/catalog checks, disconnect/rollback/concurrency and trigger guards. Only2installed function definition hashes change versus130; all other catalog attributes and pre-install stages remain identical.
- [x] Current discovery/evidence/attention64/64 and author-context/mapping71/71zero-skip; typecheck,lint0errors33existingwarnings and normal build passed. The larger intermediate PG run166pass2fail is retained: stale profile repaired; CI03 lacks its exact reviewed Mac clock library and is NOT accepted.
- [x] Preserve and verify historical130 Linux44native+149unit+normalbuild and Mac155PCR. These are not automatically current e088 results.
- [ ] Latest SQL/mapping/manifest independent scoped review and latest Linux acceptance are active in existing authorized workers; do not duplicate dispatch or modify the frozen code.
- [ ] Current full PCR/fulfillment, genuine exact review evidence and trusted runner recovery remain necessary before merge/deploy. Ordinary CI at130 had809pass2fail2skip; both concrete failures are addressed in e088 but the whole current CI still needs execution.
- [ ] Real source/author/reviewer publications, complete candidate forward validation, approved strategies and five trading-day operation acceptance remain open. AUO remains a demonstration research direction.

Evidence: `.agent/reports/2026-10-11T07-48-release-review-repairs.json`; current code PR https://github.com/Kaichen9527/stockinsider/pull/363 . Protected130 run38121306971 fails missing exact-review ref; known runner trust ingress is still absent. Do not invent signatures/authority, rerun unchanged missing capability, push main directly or enable the research schedule. Expanded VPS capacity is not the current blocker; no production writes or deletions in this increment.


## 最終安裝與實際 caller 驗收接續（2026-10-11T08:10Z）

- 正式候選收斂為 main-based PR #364，凍結 d6e0d13d1deb223ce978b372b4cce996c8541fe0；main 仍169aad1。76 selected／75 applied／1既有 superseded skip 的完整安裝及15 native案例已通過；48份原base SQL與歷史保留規則未改。
- 獨立 main→d6 application/release CODE 整合通過，1714 final blobs匹配；historical evidence producer/probe programs不冒稱全部獨立code-reviewed。七個原P2已修，保留原RED及request-changes。
- exact d6 Mac產品測試155/155、零skip；Linux完整原research命令818項：816 PASS、0 FAIL、2 explicit isolated-profile SKIP；型別、lint（33既有warning）、正常build通過。VM證據37b1c8db…的30 raw／813364bytes已由root逐項hash核對，自有程序停止。GitHub普通CI38123025680 product-runtime與diagnostic成功；model/evaluation skipped及protected failure仍分開標示。
- 31項獨立動態履約盤點發現原155綠不能代替caller證據。d6原矩陣20項映射、11項缺口；PR #365的b17b60896ac0c85a855812ed4a4a2f4aa2a0fb95新增5個真caller測試與獨立scoped CODE PASS，5/5零skip，補018/025/026/029/031。未改原inventory、要求、runtime、SQL或strategy參數。
- 尚待001/005/006/007/011/023的指定caller證據。011真SQL及023真aggregate owner各1/1補測有用，但不能冒稱JS adapter／main-envelope caller已跑。下一件工程應直接按已保存矩陣補這6項，而不是再重跑沒有改變輸入的gate或同一155套件。
- 更正：exact runtime-review-attestation原grammar只有10欄unsigned canonical JSON，沒有額外signature要求。真正CODE及31履約完成後可按原協定建立精確三檔direct-child evidence；trusted runner復原屬另一條邊界。沒有偽造PASS evidence、簽章、作者或批准。
- 已保存完整raw、coverage、matrix及更正於release-final-review/caller-progress收據。友達仍為示範研究方向。未合併、未正式migration/deploy、未批准策略或啟用研究排程；VPS舊空間不足不是阻擋，也沒有新確認可刪資料。


## 安裝 caller 補證（2026-10-11T08:19Z）

- PR365 更新 exact `7073f3a77ed235045b0eefb1db52ce4f7101a856`，只新增 PCR001 實際 `runRuntimeInstallation` 測試；runtime、migration、策略及原驗收不變。真實隔離 Git direct-child 經 resolver 到 installer prepare，自有 manifest 寫入／讀回；注入 reviewedRelease、錯誤 lineage、第四檔 diff、worker hash 錯誤皆在 staging 前拒絕。
- root 新案例1/1、兩補充檔合計6/6，零失敗／skip；正常 build 通過。獨立 Git-extract68檔後新案例1/1及 scoped CODE PASS，原始收據／TAP 保留。合成三件證據僅測試 fixture，不是正式審查批准。
- 31項 caller audit：原 d6 20項加已審6項補證，剩 PCR005／006／007／011／023。尚未製作完整31項PASS，不能把原155測試綠燈當完整履約。下一件補真 CLI main 的 config→acquire／worker→序列化邊界，再補真 PG adapter 及 aggregate main。
- Cloud既有聊天仍 idle/cursor21，沒有重複派工。ordinary CI38124241862在本收據快照仍執行；protected38124240138缺7073 exact-review ref，沒有同輸入重跑。main未合併、未部署、未改正式資料／排程。d6完整安裝及Linux成果仍保留但未改標為7073執行。
- 來源、真實兩篇文章、策略與五交易日驗收仍未完成；友達維持示範方向。詳見 `.agent/reports/2026-10-11T08-19-installation-caller-progress.json`。


## Five publication checks and actual protected execution (2026-10-11T09:23Z)

- Frozen source399e9bdebfdd05b7b2f8caf5efd879ff728ad9fd/tree d3a623aff477b74fb0e217234958630742585250; PR364 is main-facing and ready. PR365 test delta is included; GitHub marked that stacked PR merged, but main remains unchanged.
- All31 caller obligations verified:20 reuse unchanged d6 original155 evidence;11 use399 native PG1 + caller9 tests, zero failures/skips.399 normal build and ordinary CI38127311703 passed.
- P2 swallowed assertions repaired and independently reproduced: payload/read hash/JSON assertions outside worker handlers and intentionalStopReached required. All original REDs and e67 evidence preserved.
- Genuine main-to399 independent application/release CODE PASS. Actual writer output31 entries;record b4ac0cfd371c666837ba8d6403a6a72d5e5b909db63fa92749419ab5f6a6bec6. Unique direct-child e1749cb3614368ed4c2b80ab13a315040f0aba22 adds exactly3 agreed evidence files on its immutable subject-addressed ref; no fake signature/protected verdict.
- Actual main-based protected run38128096991: requirements/architecture/exact-review SUCCESS. Model job114436645777 failed with spawnSync /Applications/ChatGPT.app/Contents/Resources/codex ENOENT. This new actual failure replaces the earlier missing-exact-ref diagnosis. Product track still running.
- Attempted required-check-constrained merge-commit auto-merge; GitHub disallows auto merge for this repo. Policy unchanged; no main push/production migration/deployment.
- Fresh VPS measurement:154894188544 total/19451998208 available bytes. Actual service names stockinsider-web-standalone/internal-worker; inactive short-name probes do not prove service outage. Current release/preview still referenced and preserved. Only unreferenced own Mac Next cache224843024 logical bytes removed; unique evidence/history untouched.
-33 supporting raw/review files saved in .agent/reports/2026-10-11T09-22-final-publication-verification; VM evidence2ada86ce/d5c60254 hash-verified17+22 raw files. AUO remains a research-direction demonstration; operational article/strategy/schedule acceptance is separate.


## Protected run completed: two independent failures

- Actual run38128096991 finished FAILURE. Requirements, architecture and exact review passed; genuine result envelopes retained with hashes.
- Product acceptance completed272 cases:271PASS/1FAIL/0SKIP. GOV-001 correctly rejects the broadened migration package command against its frozen exact script inventory. Next repair preserves approved command and all added installer tests; approved inventory/assertions must not be weakened.
- Model track independently failed at the trusted host old Codex executable ENOENT before tests. Bounded audit found no callable recovery ingress in trusted main; operator recovery mechanism requested. No unchanged failed rerun, binary replacement, fake approval or gate bypass.
- Cloud packaging of399 remains active in the existing authorized task; no duplicate work dispatched. Main and production unchanged.


## Governed migration command repaired and sent to protected execution (09:55Z)

- PR364 final subject2e078dfdd74272d3d50dffdd4cc6c14df3152c78/tree6ca9a7227cea6f8312ec5e2dffc9503023d1b7bd. Supplemental PR366 is included by ancestry; main is not merged.
- Restored exact governed single-file command; canonical file imports both unchanged extra installer suites. All14 approved script values exact, original assertions/hooks retained, four added cases run once each. No approved inventory/runtime/SQL/web/strategy change.
- VM full canonical PostgreSQL17 execution87/87zero-skip, normal build and standalone package/member audit passed. Root independently rehashed38raw/1,927,143B and668source files. Ordinary CI38129034362 succeeded. Current tar28,211,002B remains VM-local; binary cross-host transfer not established, metadata persisted in Git.
- Genuine independent main-to2e CODE PASS and31per-ID provenance:20d6+9prior399 exact-source reuse;007/011 actual2e87native. Actual unchanged writer record abcec2f7fd1fa34fb537f34b27dabf04607803e2b3bc69b74e32283a8c227062. Unique3-file direct-childe802254bc34432cdb32c5b553b8fd5b30009b66c pushed immutable subject ref before PR364 source advance.
- Actual main-based protected run38130037645: requirements/architecture/exact-review SUCCESS; product active, model FAILURE oldnativeENOENT. Unsigned CODE review/ordinary CI do not certify protectedPASS. Known trusted-native oldpath ENOENT remains a separate external recovery prerequisite; no same-input manual rerun or bypass.
- No main merge, production DB mutation/deployment, strategy adoption or schedule enablement. AUO remains a demonstration research direction.

## 2026-10-11T10:12Z — real envelopes and transferable Linux package

- R2 requirements/architecture/exact-review actual protected envelopes PASS; product track remains active, model track fails trusted old CLI path ENOENT before tests. No main merge/deploy claimed.
- Closed binary transfer gap: separate draftPR367 head67901f, actual GitHub Linux run38130717511 SUCCESS; downloaded artifact11698887764, all2819files/82,956,004B audited. Initial8d80 destination P2 and actual RED retained; minimal fix independently CODEPASS. CandidatePR364 remains unchanged2e.
- Latest VPS19.45GBfree/154.89GBtotal, six services active, PG17.11. Heavy default admission not passed; no VPS build or production mutation. No new confirmed removable stock data.
- VM bounded read-only transfer probe d2634b5a preserved: existing token cannot upload; no credentials exported/retries. Durable artifact now exists independently.
- See `.agent/reports/2026-10-11T10-12-protected-release-artifact.json` for exact hashed raw. Final protected product outcome and native trust recovery still required.

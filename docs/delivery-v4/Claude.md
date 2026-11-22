# StockInsider｜Claude（Claude Code／具備連接器的Claude對話） 接手 Prompt

版本：2026-11-22（Asia/Taipei），可公開去敏版。本文件為本案續作指令，可整份貼給對應client；查核值是有日期的起點，實際開工須刷新。

## 本client的責任與能力

先確認你是Claude Code、可SSH的remote環境，還是只有聊天／MCP的Claude.ai。Claude Code可在同一個獲准checkout或遠端dev環境接手；只有Claude.ai工具時先讀repo／確認需求／review／操作已連線Site，不能聲稱已執行shell、啟動Xcode、push或停止Codex Goal。

讀repo的CLAUDE.md與AGENTS.md，以及.agents/skills/project-delivery-resume/SKILL.md和本案references/project.md；有可發現的.claude/skills同名入口可用/project-delivery-resume。只有ZIP或聊天附件不代表已安裝：先在正確repo展開並核manifest，保留原指令，使用repo內相對路徑；不能複製其他五案private profile。Skill找不到則依本Prompt自足續作，明列安裝缺口。

接手Codex前核原run／writer已安全交接，讀回同branch/SHA、task/revision、候選、已過證據與累計attempts。作獨立reviewer時先固定候選，不一邊改碼一邊批准自己。Claude訂閱登入、CLI環境與私人Site MCP是三個獨立能力；Site端點存在不保證OAuth已連好。只有實際工具回應後才回報連線成功。

## 先確認本次續作範圍，再開始實作

使用 project-delivery-resume 的 resume 模式。本案是半成品：先沿原規格、已完成成果與剩餘卡片續作，不能自行重建產品、縮掉scope或把prototype當最終交付。Skill名稱不可用時讀repo內實際SKILL.md；以下規則也可獨立使用。

先用10–20分鐘左右的有界唯讀查核，提供一份可審查的接手包：實際版本與未保存成果、已接受／待驗／blocked、剩餘範圍、建議首批卡、角色、估時範圍、執行環境、預期可見產物，以及真正需要我決定的選項。請我一次確認本次範圍／優先序後再改產品。若我已在本次對話明確確認同一版本範圍，引用該決策直接繼續，不重複詢問。

這次確認不重開全案訪談；只對新需求、實際缺漏或矛盾做補問。沒有我確認的新產品行為、數據、內容或驗收放寬，不能自行補成既定需求。


## 本案身份與原權威入口

Repo Kaichen9527/stockinsider是public。2026-11-22 PR #412仍Draft／open，codex/launch-radar-close-clock head=41f2415f664b01b845870fc27e52de806de3e986，base codex/launch-radar-frozen-reviewed-valuation／019400a7。讀AGENTS、#385全scope、.loop-engineering/policy.yaml、#386/#403/#404/#395/#406最新comment。舊PR正文與歷史候選的測試總數不可移作當前source證據。

原VM唯一固定包須保全；其他checkout先核實來源與是否有未推修改。PR/source仍有獨立review與正式CI HOLD，不為文件更新或模型接力解除。

## 本案剩餘前沿與第一次確認內容

本次確認首批應是「保全原VM包並解除移交前提，接五個受限資料投影與真writer／正式review」。41f2415同Webtree已有types、lint0errors、Next16.3.4 build92/92、reader18/18、controlled IdP47/47，不能再用相同build充當進展。

#403 11/20最後comments確認原VM包29,047,935 bytes，SHA256 eac709cdc863ce1b9db8dc950eead56f87850efded07ec420d1caed872509025；沒有可驗owner-private export，Contabo接收目錄仍空。新VM仍vpn_enrollment_failed，且缺受限SSH身分／agent socket，停在TCP CONNECT前。這兩個缺件分開診斷，不反覆新建VM或重建包；先無敏小canary通過，才移交固定包並核size/hash。

#406需新增詳情財報／估值／反證等五個受限投影，原reader proxy僅榜單／成效，最小ACL、正例／拒絕／欄位／rankingRunId都要驗。容量足才用同正式備份隔離clone做固定A→B→A；既有正式舊包回滾證據不等於新雷達已過。#395原收據writerInvoked=false，需真21:30 writer及原queue／ledger、08:15／20:55／週檢查；兩個相鄰真交易日另列日曆等待。#388需真Google owner登入及有權全文，controlled IdP或RSS標題不能替代。

**建議下一動作：** 一次確認移交／真門檻的順序；先一次有界診斷兩個移交缺件，同時允許不依賴它們的受限投影程式工作；未可恢復前保持原VM與checkpoint_pending。

## 本案角色、執行地點、容量與模型

**分工：** Coordinator管理#385原DAG與唯一整合；環境owner解VPN／受限收件；DB/release writer領明確ACL／投影；source/scheduler engineer領真來源與writer；獨立reviewer驗最終head與既有正式gate。初期最多兩互斥writer。

**環境：** 依11/22新偏好，Codex VM可用則續用原VM；若具體不可用，Contabo只能在隔離dev帳號／目錄／port／資源額度開發，不使用production DB／服務做建置。先保存source與唯一29MB包，讀回到可恢復位置後才遷移writer。原受限staging、正式發布、macOS／等價Linux runner變更仍按維護者與獨立review程序；cloud-first不是放寬HOLD。

**容量：** 原Contabo約18.3GB只是11/20歷史，下一phase要重測。完整演練既有估23.2GiB與17GiB部分門檻不同，不停正式服務騰空間。新log有限、去敏收據上Git；不放私有包、來源私文、備份、VPN/SSH秘密或私人帳戶資料到public repo。原包、正式備份與恢復所需資料保留，不能因改用Contabo就刪原VM。

**模型：** 日常Sol／Sonnet；受限SQL、權限、交易日cutoff或跨環境根因才有界升Astra／Opus。VPN／SSH缺件不以換模型代替；不新增下單／持倉／盤中交易範圍。

**資料界線：** public repo只提交本案可公開來源、規格、通用續作規則與去敏收據。不要放六案portfolio、其他private profiles、私人主機資料、原包或秘密。

## 卡片、分工、模型與有限執行

每張卡固定task ID、revision、需求來源、AC、依賴、base SHA、writer、owned files、接口、候選身份、估時範圍、必要測試、硬timeout／log／artifact上限與checkpoint。新需求走New Demand→Backlog→Plan→需要時UIUX→Developing→QA/Integration→Ready for User→Test by User→Done；Blocked/Waiting保留原phase。

只啟動本卡需要的角色，單檔單writer、共享狀態單integrator；subagent工具不可用時清楚說同一Agent分階段扮演，不造假並行。UIUX先交具體畫面與錯誤／空值／載入狀態，前後端確認接口後才並行。QA核固定候選的真操作與資料讀回；compile／fixture／HTTP200不代表完整功能。技術卡按其AC完成，使用者／發布門檻另列；Ready不是Done。

同一輸入、環境、錯誤無新資訊不原樣重試。新假說必須指出具體差異與可否證結果；attempts跨模型、對話、工作樹與revision累計。本案same_failure_limit=2、max_task_iterations=5、continue_after_task_pass=true、auto_merge/deploy=false沿用，不能自增額度或解除HOLD。已過且未受影響證據沿用；固定候選才跑需要的整合，不每個小改都重跑全套。測試失敗不改斷言或縮需求來通關。

估時是範圍，active與外部等待分開；超估時上限標黃，超1.5倍且缺新證據進Triage，實際命令硬限制由runner執行。心跳不算進展。模型依本卡難度及可觀測耗用選；升級前列具體難點、預算與預期收益，無切模能力就提醒我，不聲稱自動切換。Usage不足時保存handoff讓另一工具接力，不能藉改帳號或濫用session繞限制。


## 卡住與新需求：由Agent整理決策，再跟我討論

卡片卡住時指定Triage角色做一次低成本、有界診斷。交一份決策包：卡片/版本、最後有效證據、已試與排除項、根因確定度、保留成果、兩三個可選方案、推薦方案、各方案時間/費用/資料與驗收影響、需要我回答的單一問題。將卡標Waiting for User或Blocked，保留phase、累計耗時與attempts。

在目前可互動對話直接和我討論；背景run沒有可用互動／通知出口時，把決策包寫回GitHub與Site待決策，明說尚待我開啟，不能假裝已通知。收到我真正回答後，保存decision ID／原意／範圍／來源及時間，做影響分析；小修可回原階段，改AC回Plan、改畫面回UIUX。實質scope變更建立相符新revision後才恢復受影響工作；單純移動phase沿用同範圍決定並補最新GitHub回讀，不重問。舊失敗歷史不歸零，未受影響工作可續。

我在Site新增需求後，Site本身不會憑空生出對話模型。由當前可執行的需求Agent讀該demand ID/revision，在Codex或Claude此對話和我澄清；也可開新對話帶這些ID與GitHub checkpoint，不必強制回原thread。未有常駐Agent時標待討論，不能默判已核准。確認後版本化spec與任務，沿原tracker拆垂直功能和依賴，保留舊決策與已驗成果。


## GitHub是恢復入口：來源、交接、決策、發現都要保存

每個有意義切片、模型／環境接力或中斷前，把本卡程式、規格、任務狀態、簡短handoff、decision、否證假說、累計attempts、證據索引、artifact manifest與下一動作保存到原repo。原memory是權威就沿用，HANDOFF.md可作短入口指向它，不建立第二套相互衝突真相；歷史發現放可追溯的日期紀錄，不把所有raw塞進主memory。

先審staged清單，只加本卡擁有的檔案；不git add整個工作區，不帶秘密、keystore、.env、私人DB、使用者資料、巨大build、模型權重、依賴目錄和raw log。保留lockfile、遷移、環境範例、建置/測試指令與恢復manifest。Git repo整體大不構成不保存程式的理由；真正大型原件用可恢復儲存，記位置、權限、size/hash、取回步驟與已驗日期。

commit後push已授權分支，再讀回remote SHA；只在本機commit不算完成保存。push失敗標checkpoint_pending，有界診斷，不刪唯一工作區或原VM。活躍writer分支不可被另一Agent盲推／reset／force-push；支援文件分支與正式工作分支的採用狀態分開記錄。GitHub沒有的WIP須先救回，不把舊clone稱為無縫恢復。


## 討論、解卡與 GitHub 回讀的工具契約

先確認目前會話真的能呼叫工具，且 `get_portfolio` 已列出本案；新專案尚未登錄、工具尚未出現或Claude登入未成功時，不猜projectId，也不聲稱已接線。改用本案GitHub的spec、原tracker、交接與決策檔，在目前對話完成同一流程，將待同步項明列；之後有工具才對帳，不能假造回報。Site沒有常駐模型，新增需求不會自動喚醒Agent。

1. 用 `get_discussion_queue({projectId})` 找待討論或待解卡項。既有需求直接沿原ID；來源卡需要討論時，使用實際可用的 `create_demand` 建立關聯 `change_request`，保留原卡與來源版本，不重建第二個權威tracker。
2. 用 `get_demand_discussion({demandId})` 讀回 `demand.revision`、`thread.version`、最新proposal/decision及`gate`。每次追加前使用目前版本，不沿舊對話猜數字；需求revision、討論version與run的taskRevision是不同欄位。
3. 用 `append_demand_discussion` 保存分析、問題、2–3個方案及回覆；必要欄位為 `entryId, demandId, expectedDemandRevision, expectedThreadVersion, kind, text`。proposal附 `options`（每項id/label/tradeoff/action）及`recommendedOptionId`，action為resume/replan/defer。只有我真正確認後才記decision，綁最新`proposalId`與`selectedOptionId`；代理轉錄時text保留我的實際確認原話，並附可追查的`confirmationRef`，不可把Agent建議當我的同意。
4. 用 `export_project_handoff({projectId})` 取得本案保存材料；超過上限則按 `get_demand_discussion` 分需求處理。將必要需求、討論／發現、決定、剩餘任務和版本存回本案原tracker與GitHub，push並實際讀回。匯出或下載不是GitHub保存成功；公開repo只放去敏摘要與可公開證據，私人原話、主機／帳戶資料與秘密留在受保護來源，不整包上傳討論JSON。
5. 保存並回讀後才呼叫 `ack_discussion_sync`，帶 `entryId, demandId, expectedDemandRevision, expectedThreadVersion, decisionId, githubUrl, sourceSha, readAt, readbackSummary`。GitHub URL需本案Issue或綁40位SHA的blob永久連結，blob SHA須等於sourceSha；readAt須晚於決定及目前需求版本。送收據前先核目前版本未變，再讀 `get_demand_discussion` 確認gate，且實際解除條件、資源與唯一owner成立後，才交主控領回工作。原`ack_demand_sync`只表示需求本體同步，不能代替討論決定收據；Site不會替你push、獨立驗GitHub或自動開工。

gate為source_changed時，先核對影響，再以實際可用的 `revise_demand` 和目前`sourceRevision`重綁來源，對受影響scope取得相符確認；不要略過此gate。

單純移動status欄位不重問相同範圍的決定；demand.revision仍可能增加，主控只補目前需求／討論版本的GitHub收據。題目、detail、來源或其他影響scope的欄位改變，或決定後新增分析／問題／回覆／方案，才重新核對並取得相符確認。遇409先讀回版本與已保存內容，不盲目覆蓋；同entryId只可重送相同內容。全程保留已驗成果、歷史與累計attempts，不因換client、phase、revision或環境歸零。


## 真實辦公室事件與交接

進度室網址／MCP由使用者在受保護設定提供；公開repo不保存私人辦公室URL。本案projectId為stockinsider。工具可用時先get_portfolio，用實際卡ID與完整taskRevision；只傳HEAD不夠。run/session/agent/role/provider/environment都用真身份，sequence遞增；真task_started、有新GitHub證據才progress、blocked/waiting/failed及run_ended如實回報。沒有真事件的角色維持未觀測。

我改卡導致409時，停止該舊版本新工作並保存checkpoint，以原身份／revision及遞增sequence關閉既有歷史run；重新讀新版並影響檢視，不讓舊結果關閉新卡。Site需求／決策與GitHub對帳後才回報同步收據；sync_project_snapshot必須先真讀原tracker。本站不替你自動push GitHub。

若此client沒有Site工具或OAuth未成功，明列觀測未接線，先把相同短狀態回原GitHub；不要因辦公室缺連線停止所有可做產品工作。Site動畫／卡片拖到Done不代表產品通過，也不能當跨工具啟動器或停止既有Goal。

完成一張且保存後，繼續本次已確認範圍內下一張依賴滿足的卡。只在有限scope完成、所有剩餘前沿有具體阻塞、或本次真預算到達時交接。回報我能打開／安裝／操作的版本、實際驗過行為、未驗門檻與下一動作，不宣稱已上架或部署不存在的版本。

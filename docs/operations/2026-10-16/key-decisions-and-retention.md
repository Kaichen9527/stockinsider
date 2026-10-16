# StockInsider：關鍵決策與對話整理索引

快照：2026-10-16 17:15台灣時間。這是恢復工作的短索引，並非完成聲明。每次恢復先核remote main、progress最新[launch-status](../2026-10-11/launch-status.md)、工作樹與同Cloud handle。新證據優先，不因本文件舊活動狀態重派。

## 真實完成範圍與唯一活動工作

完整首版：實際來源／完整候選／Top20，友達與第二產業公司的可重算研究及獨立正式發布，合格技術觀察，精確版本真檢查後protected標準merge commit／部署驗收；策略與正式研究排程仍待獨立驗收。Goal與工程heartbeat ACTIVE，工程綠不代正式文章或策略批准。

- main：`93e44475cbb0c27beb26e4dcb68e382096a4e212`；tracking可能舊，使用ls-remote／exactSHA。
- progress：`codex/research-release-review-evidence-oct11`，本索引前最新`02f52326dcdff60a4cb7c1bc661be2d7c525aca2`。
- Root：`01a0b7b4-8534-7741-9de6-177edf929f58`；Cloud：`01a106b8-a883-7185-9962-f7372109a093`／host durable。
- 唯一活動turn：`01a143f3-7520-72aa-99bb-2b1d7fa35447`，cursor `3f58cf3b-49b3-4414-877e-42d89130b651:6`，branch `codex/research-v3-reviewer-result-union-source-oct16`／base `6d68136a19ba9c45a62909cb2ea4313fd6161b21`。最新inProgress：maker表示result composition／pure packet／editorial首次module TS通過，補兩既有SQL body union與installer guards；尚未交付exactsource或新native。
- 下一關：同handle收真terminal及remote交付→Root exactreview→另freshnative→Q-R／reviewpack／atomicpublication／四caller與formal研究。timeout、cursorreset、短暫idle不是重派理由。

## 決策與收據入口

| 主題 | 精確pointer | 範圍 |
| --- | --- | --- |
| DD已部署／桌手機 | Root receipt `ed3782167b999a83261ab66a40c66616963c0204e84cc4832f82ba31544237bb`；`.agent/reports/2026-10-15T22-58-approved-dd-binary-deploy-and-responsive-smoke/` | 原批准binary；不含新金融／研究程式批准 |
| v3 source接線 | TS `222d922b7616d5ab55b7e3261982983841d9f9f9`；Root receipt `1625a38938c7addff3867e0da539068a4b81b0ae2472cfa90a373c760fad61c7` | 完整pure stored重驗及5key fence source |
| handoff／reviewer native | Harness `014d6468add162fa54c34680c07f10e2dab789c3`；evidence `6d68136a19ba9c45a62909cb2ea4313fd6161b21`；maker receipt `bad2f9664dc182a91d02cb6aa4ac65319744a66ffb01e524c1e3abcd50cb9333`；Root receipt `180531d18ba3bb2cc98b83885d3ab2b245a4597630ea4e9d4a5f97116d0f9811` | 單次兩child+parent3PASS；SQL安裝、completed READ/replay、packet、真read tombstone拒絕 |
| 下游版本缺口 | Root receipt `904e8c2fcfd4381f4b1bcc3a131ba8df1c017059c6485eab0fc6e6d5440afa7b`；`.agent/reports/2026-10-16T16-47-reviewer-result-publication-boundary-map/` | v2result／v3flatpacket source邊界，非新PG反例 |

最後native：317Gitinputs／10319157bytes、14公開收據／376869bytes。205private raw／310150803bytes僅Cloud本機；Root只核inventory與公開證據，未取得全部private內容或親跑native。完整兩原稿SHA／文字與表格保存，不代逐claimsemantic批准。

必保留的操作決策：

1. DD原包one-shot已消耗。current／唯一writer最後真核`dd59817f750684b093965f539dd4de466be13077`／lease0／2026-10-15 14:51:25Z；不冒金融50／pub26已安裝。不重deploy／stream／activate／main169-deploy.sh。PR370、371、372、374至382終態不再checks／watch／rerun／ready／merge／helper；373唯一例外已耗盡，rules20177392 active／bypass[]。禁止directmain／admin／bypass／auto。
2. finite版本dispatch、原v2 byte arm／request／hash／clock／replay保持；knowncandidate拒絕不fallback。只必要既有SQL body，不新role／table／function／GRANT／owner或放寬鎖／caps／quotas。
3. completed handoff使用current5keybinding；完成reviewerresult READ只result-context／sources＋完整pure重驗，不能activeassignment/input READ、FS或重新receive／claim／renew／prepare／seal。Mutationloss只uncertain＋explicitREAD。
4. review65536／source307200／article262144／receive與packet1MiB／depth12／共享10s／4slots／30分鐘與distinctprincipal-thread-invocation保持。Partial4sourceHs／NodeHc、synthetic來源與engineeringprincipals不代wholeNext／真作者／reviewer或正式權利。
5. 原RED及各green原樣保留、不加總。重要舊RED：79fd SQL42883、c38 SQL42601、07b native0PASS2FAIL fixture。歷史15d4不可整merge；production資料只guarded內部端點，不造authority／publisher／PIT／策略批准。

尚待：legacy77／compat、其他ACL-rights-lease-caps、真handoff與reviewerassignment transportloss、reviewerresult／Q-R／reviewpack／atomicpublication／wholeS-C-B-Q-R-A／四caller／逐claimsemantic與兩formal文章／來源Top20／合格技術觀察／策略／正式研究排程／fixedpeer-HBA及金融正式安裝。

## 低容量與對話整理

先量實際bytes，保守以5GiB（5368709120）啟動唯讀盤點，另記十進位5GB（5000000000）。盤點專案相關session／舊產物的path、大小、mtime、thread/worktree、active狀態、Git/receipt/研究稿/排程/他chat引用、可重建性、是否唯一證據。先保存本索引、必要source/receipt/原RED/raw/WIP，再逐項判斷；「舊」不等於「沒用」。實際回收量以同filesystem操作前後bytes確認。

本Root與活動Cloud及parent/descendant依賴保留。Docker、unknown/shared、其他App、iCloud、runner、股票歷史、帳本、唯一研究資料或cache不列為自動刪除目標。新例行未變poll保留工具觀測即可，不反覆複製整份prompt／報告／raw到Git；重大決策、exactsource、真檢查、原RED、發布收據保存短索引＋精確pointer，舊封存證據保持原樣。

官方OpenAI Docs對CLI的行為說明：

- [Compact](https://learn.chatgpt.com/docs/developer-commands#keep-transcripts-lean-with-compact)：摘要先前turn，釋放上下文；文件沒有承諾本機磁碟回收bytes。
- [Archive](https://learn.chatgpt.com/docs/developer-commands#archive-the-current-session-with-archive)：保留逐字稿、可unarchive；正在跑的turn會先停止。歸檔可整理列表，不是刪資料。
- [Delete](https://learn.chatgpt.com/docs/developer-commands#delete-the-current-session-with-delete)：永久刪逐字稿及spawned descendants；執行中的chat不可用。刪前先核Git證據、唯一raw、活動與descendant依賴。

這是CLI文件，不代表桌面App具有相同輸入方式。本次只建立索引，未compact／archive／delete或刪檔。約7.0GB未觸發占用盤點，因此沒有捏造可刪對象或預估回收量。整理對話前先用此索引核對證據仍可取回。

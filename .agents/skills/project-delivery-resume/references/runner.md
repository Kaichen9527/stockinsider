# 有界命令執行器

使用 `scripts/bounded_run.py` 執行一個已選定、可在前景完成的測試或建置命令。需要 Python 3 與 macOS／Linux 的 POSIX process group、`flock`。它約束自己啟動的命令，不能停止已存在的 Codex Goal、其他 Agent 或外部服務；PASS 只代表該命令成功，不代表功能已驗收。

## 先套用專案既有規則

讀專案 profile、原 AGENTS／CLAUDE 規則及卡片，取得確切 timeout、剩餘磁碟門檻、log／artifact 上限、嘗試上限與保存檢視期限。沒有通用的 25 GiB 磁碟預設。以 `--min-free-bytes` 保留原規則的精確單位，或用 `--min-free-gib` 傳 GiB；不要把 GB 與 GiB 混用。若還不知道專案限制，先盤點，不自行換掉既有門檻。

同一主機上所有重型命令共用一個持久 `--state-dir`，例如使用者本地狀態目錄中的 `project-delivery`。不要為每次對話、每個 worktree 或每個專案另建 state-dir，否則它們沒有共同的重型鎖／歷史。狀態目錄應放在本機磁碟，不放暫存 VM 以外不可恢復的位置或假設網路檔案系統具有同樣鎖語意。

## 呼叫

從已安裝 Skill 的實體位置執行，變數由專案 profile 填入；`CHECK_COMMAND` 表示已核對的執行檔與參數，不是 `eval` 字串。

```sh
python3 "$DELIVERY_SKILL/scripts/bounded_run.py" \
  --state-dir "$DELIVERY_STATE" \
  --cwd "$PROJECT_ROOT" \
  --project-id "$PROJECT_ID" \
  --task-id "$TICKET_ID" \
  --check-id "$CHECK_ID" \
  --input-id "$INPUT_SNAPSHOT_ID" \
  --timeout-seconds "$CHECK_TIMEOUT" \
  --min-free-bytes "$PROJECT_FREE_BYTES" \
  --max-attempts "$CHECK_ATTEMPT_LIMIT" \
  --max-log-mib "$CHECK_LOG_MIB" \
  --evidence-ttl-hours "$EVIDENCE_TTL_HOURS" \
  -- CHECK_COMMAND ARGUMENTS
```

將最後一行替換成真實命令，例如 `-- python3 -m unittest tests.test_login`；不要原樣執行佔位符。命令透過 argv 執行，不經 shell，stdin 關閉；需要互動式登入的步驟應先獨立完成。

`input-id` 必須包含可驗證的 source commit、未提交差異快照、規格 revision、相關依賴／環境與測試識別。使用固定 project／task／check ID；不能換 ID、state-dir 或填入每次時間戳來繞過失敗限制。runner 不會自己證明輸入快照正確。

命令會另外產生檔案時，加上 `--watch-dir <本次全新空目錄>` 與 `--max-artifact-mib <上限>`，並用工具自己的參數把輸出導向此目錄。runner 不會自動改 Xcode／Gradle／其他工具的 artifact 位置。不要監看整個 repo、既有 cache 或歷史測試資料。

## 行為與退出結果

| 事件 | 行為 |
|---|---|
| 正常退出 0 | 保存 PASS、實際 exit code、耗時與 log hash；wrapper exit 0 |
| 命令退出非 0 | 保存 FAIL 與 exit code；wrapper exit 1 |
| timeout／log 超限／磁碟不足／artifact 超限 | 標 BLOCKED，停止本次建立的 process group；wrapper exit 75 |
| wrapper 收到 SIGINT／SIGTERM | 對自己的 process group 傳訊號，保存證據；exit 為 128＋訊號值 |
| 同 state-dir 已有重型命令 | `STATE_BUSY`，不排隊、不額外消耗一次嘗試 |
| 相同輸入與命令已有 PASS | 重用原證據，`reused: true`，不重新測試；這不是新的驗收 |
| 相同輸入曾失敗 | `UNCHANGED_FAILED_INPUT`，不原樣重跑 |
| 輸入改變 | 必須附 `--change-note`；次數仍累計，不因新對話或新輸入歸零 |
| 用完持久嘗試上限 | `ATTEMPT_BUDGET_EXHAUSTED`；轉診斷／拆卡／人工判斷，不自動擴額 |
| 後續呼叫改高或改低同卡的嘗試上限 | `ATTEMPT_POLICY_MISMATCH`；初始上限鎖在 ledger |
| ledger 損壞、舊 schema、遺留 `.next` 或有 proof 卻缺 ledger | fail closed；保留原資料，不自動重置／遷移 |
| 舊 run 仍是 STARTING／RUNNING，或記錄自有 group 未退出 | `UNRESOLVED_PRIOR_RUN`；不根據舊 PID 自動殺程序 |

預設嘗試上限 2、單命令 900 秒、stdout＋stderr 16 MiB、所監看目錄 512 MiB；專案 profile 可明確覆寫。`--evidence-ttl-hours` 預設 72，只寫出 `retention_review_after`，表示何時檢視保存需求。它不刪除 log、artifact、ledger 或 result，也不自動使測試失效。重用結果會提供 `retention_review_due`。

## 證據與交接

`state-dir/ledger.json` 以 project／task／check 分組保存嘗試記錄；`runs/<key>/attempt-N/` 保存有上限的 `output.log` 與 `result.json`。記錄包含限額、實際 child exit code、輸出大小／SHA-256、終止訊號、是否仍有自有 process group。檔案以受限權限建立；stdout 只輸出 JSON 摘要，不自動公開原 log 或完整命令參數。原始 log 仍可能含敏感資料，分享前檢查。

交接時把必要的非敏感 result 摘要、attempt 計數、來源 SHA 和下一步寫入 repo 的既有卡片／現況權威入口，再保存遠端 checkpoint。原始 log 不全部推入 Git。跨主機需要外部租約與共同預算，或在移交排他所有權後完整帶走狀態；本機 flock 不是跨 VM 分散式鎖，也不會自動從 GitHub 恢復 attempts。

狀態異常時先唯讀檢查 ledger、result 與對應程序／來源 commit，確認前一個 run 的結果和所有權，再以可審查修復恢復；不要刪 ledger、改 task ID、清空 attempts 或用 TTL 自動解除未完成任務。磁碟寫入錯誤／wrapper 被 SIGKILL 時可能無法產生完整終結證據；保留的未完成記錄會阻止下一輪。

## 邊界

這是前景命令護欄。磁碟與 artifact 大小採樣不是 filesystem quota；掃描超過有限工作量會阻擋，且程式若在取樣間高速寫入，可能短暫超限。log 截留有精確位元組上限。程序若自行 daemonize／建立另一個 session，或把檔案寫到監看目錄之外，不在完整控制範圍內；使用前景模式，必要時用容器／主機 quota 補強。沒有包在此 runner 內的命令也不會受它限制。

此版已在 Linux 做短合成 success、timeout、log cap、持久 retry／corrupt-state、disk preflight、artifact、並行鎖驗證。本機或 VM 仍須另核實測，不能宣稱已保護既有建置、測試或其他 Agent 任務。可先用專案允許的輕量 smoke check 驗證，再包裝重型命令。

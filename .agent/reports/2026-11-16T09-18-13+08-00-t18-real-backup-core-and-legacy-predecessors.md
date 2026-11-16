# T18 真實備份核心遷移與舊函式前置驗收

使用 9/19 正式備份及受信管道，在 Contabo 隔離 staging 從原密文重建並驗過 288 個外鍵。實跑固定 staging commit `005a94e2bd99ed4d3d8964220ef41efb7575bda6`，綁定原密文 manifest、兩份實測 Next.js 封裝及 54 個 staging 檔案。只在可拋棄的 PostgreSQL 17.11 副本執行原始 `20261022_stockinsider_vnext_20_v1.sql`，並以原 legacy migration 的精確 catalog/hash 演算法核對 15 個舊函式。

- 核心結果 `CORE_INSTALLED_DISABLED`。14 張採 RLS 的表由指定 owner 持有，14 個既有 writer fence 覆蓋新表，空研究佇列及零公開資料。anon 與 service_role 都沒有直接讀表權。兩個模式旗標維持 false。
- Legacy 核對結果為 13 個缺少、2 個簽章存在但函式定義／權限合併摘要不同。暫時序列化函式成功回滾，legacy fence 保持停用。未執行舊研究函式、未啟動新版 Next 或 REST。正式服務、排程與 release 指標前後簽章一致。
- 真實跑程以退出 3 保留「完整新版演練尚未驗收」。最低可用磁碟 16.15 GiB、可用記憶體 4.16 GiB。隔離 DB 和工作區清理完成，只額外清除兩個此次臨時來源／資產工作目錄，原備份和兩個已核對的參考封裝保留。

| 舊函式 | 9/19 副本 | 對應的 publication tail 定義來源 |
| --- | --- | --- |
| `admit_research_observed_roster_v1` | 缺少 | `20261008_research_observed_roster_v1.sql` |
| `assign_research_reviewer_v2` | 缺少 | `20261009_research_reviewer_assignments_v2.sql` |
| `charge_research_deep_admission_v1` | 缺少 | `20261011_research_admission_isolation_v1.sql` |
| `claim_candidate_deep_outbox_v1` | 缺少 | `20261008_research_observed_claim_v2.sql` |
| `claim_candidate_dossier_outbox_v5` | 定義或權限不同 | `20260929_candidate_dossier_outbox_v6.sql` |
| `claim_research_deep_job_v1` | 缺少 | `20261011_research_admission_isolation_v1.sql` |
| `claim_research_observed_job_v2` | 缺少 | `20261011_research_admission_isolation_v1.sql` |
| `enqueue_research_deep_jobs_v1` | 缺少 | `20261011_research_admission_isolation_v1.sql` |
| `receive_research_reviewer_result_v2` | 缺少 | `20261009_research_reviewer_results_v2.sql` |
| `record_budgeted_deep_review_v1` | 缺少 | `20261008_research_observed_claim_v2.sql` |
| `record_candidate_deep_submission_v1` | 缺少 | `20261008_research_observed_claim_v2.sql` |
| `record_candidate_dossier_submission_v4` | 定義或權限不同 | 既有 V3 財務／dossier 遷移 |
| `record_candidate_dossier_submission_v6` | 缺少 | `20260929_candidate_dossier_outbox_v6.sql` |
| `reserve_research_model_v1` | 缺少 | `20261011_research_admission_isolation_v1.sql` |
| `store_observed_research_priority_v1` | 缺少 | `20261011_research_admission_isolation_v1.sql` |

14 個目標在現有固定 26 檔 publication tail 中有定義來源。表列的是此 tail 中最後一個含該函式定義的 migration，不能替代整個固定順序及相依驗證。其餘 `record_candidate_dossier_submission_v4` 也需以 V3 財務／dossier 基準核對完整定義、owner 和 ACL。下一步先驗證 9/19 副本對既有財務 50 檔入口的適用性，再使用原有 post50 catalog 守門、固定 26 檔原子套用與 postconditions。10/11 schema fixture 的結果保持獨立。

真實新版榜單、故障回滾、兩個相鄰收盤、獨立審查和正式部署尚未完成。PR #384 保留 HOLD。

- [staging 核心遷移與探針](https://github.com/Kaichen9527/stockinsider/blob/005a94e2bd99ed4d3d8964220ef41efb7575bda6/docs/operations/2026-11-16/vnext/2026-11-16T09-03-43%2B08-00-t18-core-migration-rehearsal.md)
- [固定 publication tail 驗收契約](https://github.com/Kaichen9527/stockinsider/blob/900ce0afb9de13e52000a5c338070fbd4098b5ed/docs/operations/2026-10-14/publication-tail-release-handoff.md)

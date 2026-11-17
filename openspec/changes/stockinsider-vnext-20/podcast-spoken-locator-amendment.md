# Podcast spoken-source locators

T05 reuses the existing podcast sync. The index allowlist gives access to episode metadata. A separate content analysis grant for the exact feed is required before fetching a transcript. Episode summaries and chapters remain index metadata. Existing origin pinning applies to each approved transcript request.

The publisher can offer multiple transcript types for the same episode. The worker tries up to three distinct timed renditions in feed order. It accepts a nonempty WebVTT, SRT or timed JSON track with ordered starts and ends later than their starts. A malformed track fails as a unit. Valid overlapping cues and a genuine zero-second start are allowed. It evaluates the full parsed track, subject to two megabytes and 5,000 cues, and records up to 20 distinct stock codes explicitly mentioned with a marker and present in the Taiwan stock lookup. The first matching cue supplies each symbol's start/end range. Unsupported formats or an exhausted set of valid tracks leave the content unavailable.

The shared source document records the episode link and publication time, first spoken ranges and the UTF-8 transcript revision hash. It carries derived text only. The existing authorized transcript table remains the transcript analysis path. The shared document is a weak clue and still needs candidate eligibility, source review and ordinary-share validation before ranking. The sync does not attempt audio download or ASR.

References for publisher track variants and timing are [Podcast Namespace](https://podcasting2.org/docs/podcast-namespace/tags/transcript) and [WebVTT](https://www.w3.org/TR/webvtt1/). See [staging checks](evidence/2026-11-15-t05-podcast-spoken-locators.json). Creator permission, an actual usable Gooaye transcript or authorized audio, and the full source-to-site workflow remain open.

## 授權分集逐字稿

若創作者以 RSS 之外的方式提供可分析的定時逐字稿，受保護的設定 `PODCAST_AUTHORIZED_TRANSCRIPT_TRACKS` 可登錄 JSON 陣列。每筆填入 `feedUrl`、`episodeUrl`、`url`、`type`、`language` 及 `utf8Sha256`。分集的 URL 必須與同一允許清單 RSS 項目完全相符，並沿用既有內容授權與來源網域。逐字稿網址不帶憑證、查詢參數或頁內識別，雜湊以 UTF-8 稿件內容計算。保管真實網址及授權依據於既有私有設定，不提交 Git。

指定稿件失敗時，該集保持內容缺口。VTT、SRT 或時間碼 JSON 通過雜湊與時點驗證後，可保存口述定位以及證據版本。整集覆蓋、真實公司識別和獨立審查需依實際稿件分別驗收。

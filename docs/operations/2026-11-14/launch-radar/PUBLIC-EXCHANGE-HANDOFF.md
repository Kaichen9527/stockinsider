# Public exchange raw replay handoff

Status: **CALLABLE_STAGING_IMPORTER_TESTED_AT_e4bd698; ACTUAL_OFFICIAL_RAW_REPLAY_NOT_RUN**. The actual reader has the optional in-process replay binder; the offline CLI is callable. Source e4bd698aa0ae716a193354db1a41b5335f240ace passed532unit/integration/CLI tests, types/lint/fullbuild and33controlled browser regressions. These are synthetic/controlled results, not official acquisition, full runtime producer or release PASS. **Do not upload or request public T86 raw artifacts until redistribution rights for that exact route/content are independently verified.** Ordinary GitHub currently carries public URL/hash/clock metadata only, or bytes whose exact distribution scope has been independently established. Public reachability is not a redistribution license. No raw PTT/member/private content, credentials or private headers enter Git. No Cloud proxy, alternate origin, TLS or credential workaround is requested. No runtime raw-artifact download is requested yet.

Latest rights/precision update: government datasets11755 (TWSE index),11391 (TPEx index) and11856 (TPEx institutional flow) identify GovOpenDataV1 attribution obligations for separately specified CSV/open-data resources. These are distinct provenance from the JSON URLs below; matching values or schemas do not transfer that license. Resource candidates include `MI_5MINS_HIST?response=open_data`, `indexInfo/inx?response=data` and `3itrade_hedge_result.php?l=zh-tw&o=data&se=EW&t=D&d=115/11/12`. Exact licensed resource URL/schema/attribution evidence is required before a versioned CSV decoder or public raw exchange is activated. These are draft resource identities, not permission to guess paths/query order.

## Current observed scope

The coordinator retrieved external receipt commit `1f9dd6e`, exact Git blob `7c1c318b52a7e86ae334776d2833aa3f8cda03d9`. Its local received bytes have SHA256 `d5da74a09b7899f3e8df8a1d6973a8a803632f12e93a34b33eabdae9e9b563b0`. The receipt schema is `stockinsider-official-launch-window-observation-v1`, with model/source reference `afce744dfafd5fd3e118187d5504dca1507307f2`.

It records22 monthly index responses (January–November2026, both markets) and42 daily institutional responses (21 observed dates, both markets):64 URLs and54,530,502 reported response bytes. The source is the coordinator-preserved `work/ptt-official-nov15/official-window-observation.external.json`; all64 URL/hash/byte/observation records are reproduced below. These are observation claims bound to that exact receipt, not locally replayed raw responses. The receipt explicitly says `bareResponseRetained:false`, `pointInTimePublicationProven:false`, `productionIngested:false` and `rankingAcceptance:false`.

The observed index date unions contain208 dates per market from2026-01-02 through2026-11-13 and are reported equal between markets. This supports the following **observed-row plans**, not calendar authority:

| Signal label | Observed index rows at/before label | Last200 observed index dates | Exact20 observed flow dates |
| --- | ---: | --- | --- |
|2026-11-12 |207 |2026-01-13…2026-11-12 |2026-10-14…2026-11-12 |
|2026-11-13 |208 |2026-01-14…2026-11-13 |2026-10-15…2026-11-13 |

The shared21-date flow union is:

```json
["2026-10-14","2026-10-15","2026-10-16","2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-27","2026-10-28","2026-10-29","2026-10-30","2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06","2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-13"]
```

These dates were read from reported index/flow observations, without weekday inference. The actual selected-read bridge must compare them with its independently verified completed-session calendar and refuse any missing/mismatched session. Index presence or equal market date sets cannot establish official calendar completeness, price/action cache completeness or two actual ranking days.

## Fixed URLs and parser identities

Use the exact spelling, host, query order and percent encoding below. A different route/schema needs another version; no host alias or old TPEx route is silently substituted.

| Market / kind | Canonical URL template | Required interpretation |
| --- | --- | --- |
|TWSE / daily flow |`https://www.twse.com.tw/rwd/zh/fund/T86?date=YYYYMMDD&selectType=ALL&response=json` |Candidate2330; exact field names below; shares |
|TWSE / monthly index |`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=YYYYMM01` |TAIEX price index, fields `日期` and `收盤指數` |
|TPEx / daily flow |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=YYYY%2FMM%2FDD&type=Daily&response=json&sect=EW` |Candidate6488; versioned25-column grouped schema below |
|TPEx / monthly index |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=YYYY%2FMM%2F01&response=json` |TPEx price index; close field `收市`; inspect actual date/header bytes |

TWSE foreign means the exact field `外陸資買賣超股數(不含外資自營商)`, excluding foreign proprietary dealers; trust is `投信買賣超股數`. Require one exact requested-symbol row, valid response date and all six institution buy/sell/net headers. Buy/sell must be safe nonnegative integer shares, net a safe signed integer, and buy-minus-sell must equal reported net. TPEx requires the same arithmetic at grouped-header-proven positions2/3→4 and11/12→13. Missing pairs are failures, not net-only fallback. Do not use `三大法人買賣超股數`, market-wide BFI82U TWD, preview constants or mirror estimates in place of either institution.

The supplied TPEx schema inputs identify a25-column table with **zero-based** foreign-net column4 and trust-net column13. Names repeat across institution groups, so selecting the first matching `買賣超` label is unsafe. Before accepting this schema, provide the full raw JSON header array and the official grouped-header HTML/source bytes from `https://www.tpex.org.tw/zh-tw/mainboard/trading/major-institutional/detail/day.html`. The receipt does not contain those bytes; do not fabricate the other23 column names or claim the grouping was locally verified. The corresponding index schema source is `https://www.tpex.org.tw/zh-tw/indices/stock-index/industrial/inxh.html`. If the supplied HTML lacks the grouping because it is rendered elsewhere, preserve the gap rather than infer a group. Availability of the newly observed historical routes supersedes the earlier “latest-only endpoint” availability gap; raw schema/replay remains incomplete.

The current11-month plan is January–November2026 for each market. The original conservative TWSE-only13-month request, now an optional fallback if needed, is exactly:

```json
["2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09","2026-10","2026-11"]
```

Do not request those two extra months merely to repeat already observed coverage. No new official GET from the Cloud executor is part of this handoff.

## Exact consume JSON contract

The contract identifier is `launch-official-public-replay-v1`. The following is a normative closed shape; all listed fields are required, and unknown fields are rejected. `ISOInstant` is a real ISO instant with timezone and at most six fractional digits; `ISODate` is a real `YYYY-MM-DD` date. A source URL is only a source identity, never an authority assertion.

```typescript
type Body =
  | { encoding: "base64"; data: string }
  | { encoding: "file"; path: string }
  | { encoding: "absent" };       // metadata only; yields missing-body gaps

type Response = {
  market: "TWSE" | "TPEX";
  kind: "index_month" | "institutional_day";
  requestKey: string;             // YYYY-MM for index; YYYY-MM-DD for flow
  sourceUrl: string;              // exact template above for market/kind/key
  observedAt: ISOInstant;         // actual complete-body observation clock
  publisherPublishedAt: null;     // source publication clock is not established
  httpStatus: 200 | null;         // null if original transport receipt unavailable
  redirectCount: 0 | null;        // null is unknown, never assumed zero
  contentType: string | null;
  bytes: number;                 // exact decoded raw-byte count, integer
  rawSha256: string;              // lowercase SHA256 of those bytes
  body: Body;
};

type SchemaEvidence = {
  kind: "tpex_flow_group_header" | "tpex_index_header";
  sourceUrl: string;              // exact corresponding official HTML URL above
  observedAt: ISOInstant;
  bytes: number;
  rawSha256: string;
  body: Body;
};

type Replay = {
  schema: "launch-official-public-replay-v1";
  parserContract: "twse-t86-taiex-and-tpex-dailytrade-inx-v1";
  targets: [{ market: "TWSE"; symbol: "2330" },
            { market: "TPEX"; symbol: "6488" }];
  throughSessions: ["2026-11-12", "2026-11-13"];
  cutoff: ISOInstant;
  capture: {
    repository: string;          // owner/repository
    sourceCommit: string;        // exact40-character lowercase Git commit
    workflowPath: string | null; // .github/workflows/<approved-file>.yml
    runId: string | null;        // decimal GitHub run ID
    runAttempt: number | null;   // positive integer
    startedAt: ISOInstant | null;
    completedAt: ISOInstant;     // actual capture end, at/after every body clock
  };
  indexMonths: { TWSE: string[]; TPEX: string[] }; // ordered unique YYYY-MM
  flowSessions: ISODate[];       // ordered21-date observed union above
  responses: Response[];        // full two-market plan64; minimum sample1, global<=68 incl headers
  schemaEvidence: SchemaEvidence[];
};
```

Do not add `authority`, `complete`, `integerShares`, `reviewed`, `rightsApproved`, `actionEligible` or selected-cache revision booleans to this envelope. The receipt's reported row counts/success indicators are observations; the importer must derive row identity, schema, units, counts and coverage from actual bytes.

The workflow identity is one closed tuple: either all three fields are nonnull and individually valid, or all three are null. Mixed tuples are refused. Direct coordinator/host observations use allnull rather than invent a GitHub workflow; retain repository, exact source commit and actual ordered capture/page clocks. Such input adds `capture_workflow_identity_unverified`, without claiming host identity, account, IP or attestation. A syntactically valid nonnull tuple is still reported metadata and grants no source/publication/redistribution authority; external run/artifact identity verification remains separate.

The inventory identifies64 observed responses and at most two additional schema HTML documents, **not a present raw-artifact upload request**. Raw parsing is staging-only using synthetic fixtures or bytes delivered through an independently permitted scope; unlicensed T86 bodies remain metadata-only publicly. The durable hard bound is **68 total pages including schema HTML** and **112MiB decoded bytes**. Each market may use at most13 monthly pages and21 shared daily flow pages, but the global68-page bound wins when those individual maxima cannot all fit simultaneously; reject rather than truncate. The per-evaluation chip window stays exactly20 sessions;21 files are shared only to support the adjacent two labels. The parser must derive each last20 window from observed rows and later bind it to the actual verified calendar.

### Byte and structure bounds

- Each TWSE T86 body:2…5,000,000 bytes, at most50,000 data rows. The observation inventory includes20,000-plus rows, so an assumed10,000-row cap would discard genuine exchange-wide responses.
- Each TPEx daily-flow body:2…500,000 bytes, at most5,000 data rows and exactly the verified25-column schema for accepted rows.
- Each monthly index body:2…500,000 bytes, at most31 unique in-month session rows. Duplicate/conflicting dates or off-month rows are failures, not silently overwritten corrections.
- Each schema HTML body:2…500,000 bytes. It must be public exchange schema material, never PTT/member/private HTML.
- Total decoded body bytes<=112MiB, with at most68 pages including schema HTML. File-based metadata JSON<=1MiB; an inline-base64 envelope<=160MiB and each base64 value must round-trip canonically to exactly its declared bytes. Prefer separate byte files.
- File paths are relative members under `bodies/`, with ASCII letters/digits/underscore/hyphen/dot and `/` only. Reject absolute paths, empty/dot/dot-dot segments, backslashes, symlinks, duplicate paths and archive traversal. Verify every used member's size/hash before parsing; do not read unrelated archive members.
- Index dates/prices, raw flow numerators and volume denominators must satisfy the existing score-rulebook numeric/unit checks. Missing candidate rows, missing pages, conflicting rows, malformed JSON, HTML challenge pages or unsupported schemas never become zero.

`rawSha256` is over the delivered response bytes. Existing provider receipts and raw calendar/price contracts use that meaning. The older index-backfill helper separately hashes `JSON.stringify(payload)`; that is insertion-order serialized JSON, not RFC8785 canonical JSON. The new parser's distinct `canonicalPayloadSha256` uses the existing canonical-JSON hash helper. Neither parsed/serialized digest is relabelled as the received-byte digest. File/base64 delivery must preserve original bytes, not pretty-print or reserialize the payload.

If the original64 bodies were not retained, they cannot be reconstructed from hashes or numeric summaries. A fresh authorized capture has a new observation clock and potentially new immutable hashes. Supply its new descriptors and retain the old inventory as history; do not claim that newly downloaded data is the old body or backdate its availability. Unknown HTTP status/redirect metadata remains null and an explicit transport-provenance gap. A body can be hash/schema replayed without manufacturing verified transport or external source authority.

## Clocks, binding and caller integration

All64 observations occurred on2026-11-14, with the last reported observation at `2026-11-14T16:36:58.832237+00:00`. A replay cutoff must be **strictly after** the actual capture's `completedAt`, not a preset2026-11-12/13 publication cutoff. For historical date-only reports, normalized `sourceTimestamp` is the actual observation completion time, availability cannot precede it, and `publisherPublishedAt` staysnull. A session label is not an original publication/knowledge clock.

The planned implementation has two separate results:

1. Raw replay parses and hashes real public bodies, derives their observed dates, foreign/trust raw share values and same-market index closes, and returns explicit schema/coverage/transport gaps. It can pass this byte/schema replay stage without pretending an actual selected company-price/action cache exists.
2. The existing selected-read call supplies the real source cutoff and its verified calendar,240 adjusted-price history, action revisions and current51-session share-volume proof. A thin binder checks each raw flow/index session, clocks, units and immutable source revision against that selection before creating `LaunchExternalEvidence` for `scoreLaunchReadEvidence`. Missing selected history/action/calendar proof retains null points. The public manifest cannot mint those revisions or bypass the original selector.

TWSE price volume must retain its exact official `成交股數` source and integer values. TPEx monthly history reports rounded `成交仟股`/`成交張數` and `成交仟元`; multiplying a rounded quantity by1000 does **not** prove exact native shares. The old normalizer's behavior is historical source, not a Launch Radar denominator guarantee. The additive launch helper must refuse TPEx share-volume proof until51 exact native-share rows, source row hashes/unit precision and complete action linkage exist. Two adjacent exact `dailyQuotes` observations cannot prove20- or51-session denominators. TPEx raw flow/index parsing may succeed independently while chip/volume points remainnull. Flow/index responses do not prove company actions or widen the51-bar proof for an older fixed breakout.

Later external metadata reports57 `dailyQuotes?...&response=json&type=DailyClose` observations for6488, August20–November13, with native integer-share/NTD field availability. This supersedes the earlier two-date availability count, **not** the precision/lineage gate: no raw bodies or complete field arrays are retained in that receipt. Metadata cannot replace a raw exact-share decoder and selected row/calendar/action binding. A separately verified57-session raw proof may later cover the required51 window; this staging slice does not manufacture it. The external price receipt reports70 monthly responses/693 dates per market, not complete three-calendar-year history plus warmup. External action metadata also places2330's September16 mixed dividend/right event inside the current51 window; the earlier range receipt supplied no cash-only/share-neutral proof. A later user-confirmed TWT49U2330息 row plus company1Q26IR cash/zero-stock dividend is a new dual-source provenance positive, not yet a raw-byte/typed-event product bridge, so the existing selected-window refusal remains. All three complete daily action feeds remain necessary.

The implemented staging adapter reuses existing official URL construction, exact-schema parsers, selected authority and scoring functions. TPEx's newly supplied routes receive a separate fixed parser identity, with no reinterpretation of old route hashes or source allowlists. No new writer, database migration, source registry, scheduler, paid provider or credential is required by this handoff. The old520-session market engine and240/1320 price gates remain unchanged; a200-row score operand does not satisfy those other contracts.

GitHub artifacts may carry only bytes whose exact redistribution scope is independently established, using normal repository/artifact APIs. Public T86 exchange is metadata-only pending that rights evidence. Independently pin expected repository, source commit, workflow run/attempt and artifact digest before consuming; the manifest's own claims do not grant that trust. If an allowed artifact later exceeds tool limits, split it into numbered parts with one complete descriptor manifest and exact member hashes. No alternate exchange domain, private login, TLS weakening or proxy change is permitted. The manifest/parser grants no source rights.

Neither reported date12 nor13 is a point-in-time ranked publication. Raw replay, current input availability, selected-read arithmetic, formal review and official ranking are separate evidence. All source/entry/ranking/publication authorities remainfalse until their independently required gates are met.

## Exact external observation inventory

The following tables copy only the public URL, reported received-byte length, reported raw-byte digest and reported observation clock from the pinned receipt. They contain no raw bodies and no inferred HTTP status, redirect count, original publisher timestamp or authority.

### Monthly index responses (22)

| Market / key | Canonical observed URL | Bytes | Raw SHA256 | Observed at |
| --- | --- | ---: | --- | --- |
|TWSE / 2026-01 |`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20260101` |1495 |`cbc907affe310993b74ca2fc183c316c195b661886acc8dec8e1ee9ef6971415` |`2026-11-14T16:35:45.246451+00:00` |
|TPEX / 2026-01 |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=2026%2F01%2F01&response=json` |1434 |`7efedabd216ef9ae436ac9b94b41ef43eccbe0a1ef65042a34b2c3b8916ad2e4` |`2026-11-14T16:35:45.074239+00:00` |
|TWSE / 2026-02 |`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20260201` |937 |`66f10e8da761a212bced644714c6a3dc39de5d7d3daf657560af48e67ffd75c6` |`2026-11-14T16:35:45.238536+00:00` |
|TPEX / 2026-02 |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=2026%2F02%2F01&response=json` |909 |`4667182674418155e36b74173e20f3f7592ff73deee09c136264a7d0fa558937` |`2026-11-14T16:35:45.323902+00:00` |
|TWSE / 2026-03 |`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20260301` |1557 |`e8926685144b22b65e7450815dda03dbdc9a00b3b03401073596e6596d57bae2` |`2026-11-14T16:35:45.603597+00:00` |
|TPEX / 2026-03 |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=2026%2F03%2F01&response=json` |1502 |`eba286171590efc4ad02adfdb52f1bbd0c161c7e2bc0c142ee6b67c14830fb47` |`2026-11-14T16:35:45.431397+00:00` |
|TWSE / 2026-04 |`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20260401` |1433 |`64d27eaa0fec6c516821910adcdcb515006d959fa1ffaa4ae1da04f61640326f` |`2026-11-14T16:35:45.749445+00:00` |
|TPEX / 2026-04 |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=2026%2F04%2F01&response=json` |1376 |`e5e10f979bdc12ae50d50aae81fcf7a5dfd4654153fcb8e48458a2ad9179de64` |`2026-11-14T16:35:45.748897+00:00` |
|TWSE / 2026-05 |`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20260501` |1433 |`4393d084483cfa446c09e6692941a1b5d50baeb3d2535504a56b8d7609cd428b` |`2026-11-14T16:35:46.587405+00:00` |
|TPEX / 2026-05 |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=2026%2F05%2F01&response=json` |1384 |`a4f0624c3662964ff407939a0c5e4f6c0e935d01776fc3cb39725fdda13534e7` |`2026-11-14T16:35:45.831391+00:00` |
|TWSE / 2026-06 |`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20260601` |1495 |`5ee35074d3a9ad5bdb235a515978bae8fc3f36e427d4c1bb3cd60303ccbc331c` |`2026-11-14T16:35:46.645639+00:00` |
|TPEX / 2026-06 |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=2026%2F06%2F01&response=json` |1444 |`87b4370423257e009587bc750c655a1cc0d48692a0194e9722b8b4823bf7f092` |`2026-11-14T16:35:46.683913+00:00` |
|TWSE / 2026-07 |`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20260701` |1557 |`a6fc2d6b2dc31fe7ed26364d12a70e8a3d7af3a3b1d36304b22a0358cfa08a7d` |`2026-11-14T16:35:46.957551+00:00` |
|TPEX / 2026-07 |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=2026%2F07%2F01&response=json` |1506 |`3e4d47ada9f1c8eb63979e3cfc2219d296180f3e570c419b31301dbf5fabbd36` |`2026-11-14T16:35:46.845989+00:00` |
|TWSE / 2026-08 |`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20260801` |1495 |`8e0145841c212715d6e3d32ef4618545cb5da34906c2906243d69ec12edb1ad9` |`2026-11-14T16:35:47.182207+00:00` |
|TPEX / 2026-08 |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=2026%2F08%2F01&response=json` |1438 |`eea6ad178456af3cdf843be0075c3becc38827f754dc8a22881a31e4faef81d8` |`2026-11-14T16:35:47.028530+00:00` |
|TWSE / 2026-09 |`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20260901` |1433 |`b6f8cf1552ff55338934e646ca846b54d1b18c0b82919ca78f440174bb605404` |`2026-11-14T16:35:47.497462+00:00` |
|TPEX / 2026-09 |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=2026%2F09%2F01&response=json` |1384 |`832c6acf0421dba84c12ff5e8ebe9642d428ba70ab1cad240ffe3dc1f3ba5d39` |`2026-11-14T16:35:47.354002+00:00` |
|TWSE / 2026-10 |`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20261001` |1371 |`52f38cde8842e25e33a45b220f09ff814d254363691a740643537cf1f58414c4` |`2026-11-14T16:35:47.638874+00:00` |
|TPEX / 2026-10 |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=2026%2F10%2F01&response=json` |1327 |`fdfa7236fa7581df412f89a48c5444bf27a0d5731318b936f8a137cf39e0c002` |`2026-11-14T16:35:47.585032+00:00` |
|TWSE / 2026-11 |`https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20261101` |813 |`82e93d477808fa5aaf8c6e4d0ca70dd21b548ffb086f1743781e9101fb87753c` |`2026-11-14T16:35:47.897794+00:00` |
|TPEX / 2026-11 |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=2026%2F11%2F01&response=json` |801 |`9c9b89170604568a93b0fdbc6629700acb3a11ebbf089ef7564d8c173bf41794` |`2026-11-14T16:35:47.734230+00:00` |

### Daily flow responses (42)

| Market / key | Canonical observed URL | Bytes | Raw SHA256 | Observed at |
| --- | --- | ---: | --- | --- |
|TPEX / 2026-10-14 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F10%2F14&type=Daily&response=json&sect=EW` |143590 |`7069d20e119941148d73dee43c03b0d4e8c70ada895c0c07809926c9edaf5297` |`2026-11-14T16:36:18.269031+00:00` |
|TWSE / 2026-10-14 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261014&selectType=ALL&response=json` |2591123 |`47c3eecb81187c849fb497a240e641b2f788c51791d1c81e0441ccf4dd04919b` |`2026-11-14T16:36:21.813487+00:00` |
|TPEX / 2026-10-15 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F10%2F15&type=Daily&response=json&sect=EW` |147445 |`7059ac639415fdfda5831c5eab40767d0125a4485d3302c06c53a8668558dd95` |`2026-11-14T16:36:18.790406+00:00` |
|TWSE / 2026-10-15 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261015&selectType=ALL&response=json` |2709038 |`271888e51c81e05f55abd5c856aa5b60ddd116dc7bf4a76d02c6a3c5c14086ae` |`2026-11-14T16:36:22.793894+00:00` |
|TPEX / 2026-10-16 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F10%2F16&type=Daily&response=json&sect=EW` |143376 |`3389fdb41a65f65ba0ad08cb20083ac21c5cf75fb08ebecf794caee1c79ff26c` |`2026-11-14T16:36:22.526926+00:00` |
|TWSE / 2026-10-16 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261016&selectType=ALL&response=json` |2570160 |`3e85546a185d444ea974366daa622e9ed157959dff55a01e715ca442d13f8ae7` |`2026-11-14T16:36:25.418447+00:00` |
|TPEX / 2026-10-19 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F10%2F19&type=Daily&response=json&sect=EW` |142520 |`220546215b4d3aa46ffddfba59a8470f4d28249bc3087f8b6e2dc2299b4b8676` |`2026-11-14T16:36:23.300997+00:00` |
|TWSE / 2026-10-19 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261019&selectType=ALL&response=json` |2596654 |`343a7289f7e9f057d8fa0b95afc927e2dc9041b6aede282e107e4254c4cb488b` |`2026-11-14T16:36:26.191853+00:00` |
|TPEX / 2026-10-20 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F10%2F20&type=Daily&response=json&sect=EW` |139891 |`9e07e7288dea1fa85fd0c98787f8a83265992188fbacb2d39c437770aedfe06c` |`2026-11-14T16:36:26.031820+00:00` |
|TWSE / 2026-10-20 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261020&selectType=ALL&response=json` |2530692 |`8912308abc20ee5912b2edf25740216e9a3f237bb9b7efd9a07da66882b2ff4c` |`2026-11-14T16:36:28.141420+00:00` |
|TPEX / 2026-10-21 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F10%2F21&type=Daily&response=json&sect=EW` |143399 |`8253019c7558f0620c672d1eccaa4ca72c1f58b3ed342fd424f736d5be0b5dc1` |`2026-11-14T16:36:26.845403+00:00` |
|TWSE / 2026-10-21 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261021&selectType=ALL&response=json` |2615337 |`01de36a16f1895d98cbc369d3da50802e9bae7d9efdc9b5a25f5578038f500e4` |`2026-11-14T16:36:29.175868+00:00` |
|TPEX / 2026-10-22 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F10%2F22&type=Daily&response=json&sect=EW` |145944 |`0ab4c35c46f9d35e95052480236ddc468114283ef55dd7e95418d33cd751b345` |`2026-11-14T16:36:28.690599+00:00` |
|TWSE / 2026-10-22 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261022&selectType=ALL&response=json` |2452513 |`aba51f6891fb22449c717783afe55b23857519a5611ab1f1231f0f0a8090824b` |`2026-11-14T16:36:32.504006+00:00` |
|TPEX / 2026-10-27 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F10%2F27&type=Daily&response=json&sect=EW` |143074 |`5d5d657253ada100571988579b557da49576164ac72d27eba8a090252bb4cda3` |`2026-11-14T16:36:29.723375+00:00` |
|TWSE / 2026-10-27 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261027&selectType=ALL&response=json` |2326785 |`e4881562667c36f26fd34db372160ec2c8eee7add8fcf56d49b9fbd3887b1454` |`2026-11-14T16:36:35.672161+00:00` |
|TPEX / 2026-10-28 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F10%2F28&type=Daily&response=json&sect=EW` |142095 |`3e679883e5c723b0a8579f47d33cc518c7dfcc180291a823c9f8a7ea1a6325ff` |`2026-11-14T16:36:33.010254+00:00` |
|TWSE / 2026-10-28 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261028&selectType=ALL&response=json` |2555411 |`c0da8d79f32be1985fe3122edb45f4dd66ef181abf7ee08310f456889852b0a3` |`2026-11-14T16:36:36.930823+00:00` |
|TPEX / 2026-10-29 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F10%2F29&type=Daily&response=json&sect=EW` |139336 |`415231966f50818902c1fef34582c8eb8684499e74c6c3f4133dc7ea007dd9e5` |`2026-11-14T16:36:36.157177+00:00` |
|TWSE / 2026-10-29 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261029&selectType=ALL&response=json` |2388362 |`50970fa28ea2376b79bfbd1b7410cd9f7a5089221c5c713bb749b09a35c4fa38` |`2026-11-14T16:36:40.620831+00:00` |
|TPEX / 2026-10-30 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F10%2F30&type=Daily&response=json&sect=EW` |147821 |`b931557fe019c67157dd21510db9847a7bdae2397a396ee30e0beacf2b9a888b` |`2026-11-14T16:36:37.450683+00:00` |
|TWSE / 2026-10-30 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261030&selectType=ALL&response=json` |2374389 |`9eeb4d0f2ee28c04caf19697df0476601bead01efd64c79244958e50e7214127` |`2026-11-14T16:36:41.223584+00:00` |
|TPEX / 2026-11-02 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F11%2F02&type=Daily&response=json&sect=EW` |141252 |`0c5f25ed0395d188a4e6fa40dea23b00c3b94282d211ff9bcba8cca9bb38cd5e` |`2026-11-14T16:36:41.122569+00:00` |
|TWSE / 2026-11-02 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261102&selectType=ALL&response=json` |2425310 |`70403afd2f72ec8bb23fdb96e2315e56081d097bf3ddd17fe5625b2fb8008242` |`2026-11-14T16:36:43.301285+00:00` |
|TPEX / 2026-11-03 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F11%2F03&type=Daily&response=json&sect=EW` |148912 |`1f8a109e08ff2a18a8c710b61576103cbffbaecbdf0c2f14d4190506d50a9a6d` |`2026-11-14T16:36:41.934378+00:00` |
|TWSE / 2026-11-03 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261103&selectType=ALL&response=json` |2522334 |`2f7b9b9b5f597daa4ec1d579736376ee4c5ea24df6760070079c5ee04645a387` |`2026-11-14T16:36:44.298450+00:00` |
|TPEX / 2026-11-04 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F11%2F04&type=Daily&response=json&sect=EW` |149133 |`6a31d52d67bcf682bb0de7848fcdc0a15e9aa1d6692e715864bf439409667682` |`2026-11-14T16:36:43.777582+00:00` |
|TWSE / 2026-11-04 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261104&selectType=ALL&response=json` |2377582 |`b968e91adfebb1993188d7928ad4c68ca29c875971ed42fc4ae0fad5f82229f6` |`2026-11-14T16:36:46.118580+00:00` |
|TPEX / 2026-11-05 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F11%2F05&type=Daily&response=json&sect=EW` |148991 |`f62353aa803b731d116e49e49a68982c16a1ca242bf6fce13dde0429975da62e` |`2026-11-14T16:36:44.879343+00:00` |
|TWSE / 2026-11-05 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261105&selectType=ALL&response=json` |2296348 |`c1641d0ef1f3ca920baf824bba978c768439b24866c8f594edba8d601c4f3562` |`2026-11-14T16:36:47.927721+00:00` |
|TPEX / 2026-11-06 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F11%2F06&type=Daily&response=json&sect=EW` |151804 |`168bce6f242730be7ae78c3246b639a661817fa98c37bc41b74368f9b0be8d3d` |`2026-11-14T16:36:46.642333+00:00` |
|TWSE / 2026-11-06 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261106&selectType=ALL&response=json` |2087225 |`832d701a035fc2cab677bb3d48f8c357a6d20ddf4403b8d72a5178463b6a9c45` |`2026-11-14T16:36:51.151538+00:00` |
|TPEX / 2026-11-09 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F11%2F09&type=Daily&response=json&sect=EW` |146791 |`0ddcbc4c7196efc9313b892051c01f35bf1f3b98634bb183be59b013d526e72c` |`2026-11-14T16:36:48.369560+00:00` |
|TWSE / 2026-11-09 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261109&selectType=ALL&response=json` |2204682 |`8976c6665906ba9d71367abc972828a894e826f9e5d2570e354f21b110cf4b61` |`2026-11-14T16:36:50.397125+00:00` |
|TPEX / 2026-11-10 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F11%2F10&type=Daily&response=json&sect=EW` |144770 |`0076ee196ff3255656bc19973bed65510c4e27af362ec13a32865c8d997e515a` |`2026-11-14T16:36:51.002424+00:00` |
|TWSE / 2026-11-10 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261110&selectType=ALL&response=json` |2411848 |`3a4abf350c14b71e720093c023c9a38fbff6b7d035f90619dd31040acb73066f` |`2026-11-14T16:36:53.785032+00:00` |
|TPEX / 2026-11-11 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F11%2F11&type=Daily&response=json&sect=EW` |144309 |`c4ae3f1169689b40486a516dd7429d40b0c1c9892721766009febe0bd993117f` |`2026-11-14T16:36:51.666899+00:00` |
|TWSE / 2026-11-11 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261111&selectType=ALL&response=json` |2433686 |`ecb936984a7d17991de7b8b6ee4e4f5c4af8e6f7bce07f2a5ce99fc2a2cd70d1` |`2026-11-14T16:36:54.275733+00:00` |
|TPEX / 2026-11-12 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F11%2F12&type=Daily&response=json&sect=EW` |145427 |`fa9251fe448f9cfced3b15eb98388087f3993541e96663893eb50150a8912318` |`2026-11-14T16:36:54.402112+00:00` |
|TWSE / 2026-11-12 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261112&selectType=ALL&response=json` |2541453 |`398436083c232d0083668a6d784f895a3661d4e03a4e207b2510aef9d95f1226` |`2026-11-14T16:36:58.832237+00:00` |
|TPEX / 2026-11-13 |`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F11%2F13&type=Daily&response=json&sect=EW` |143705 |`1494f67f74b68a60c5d1d594052d407c104d0741e442ef29ba9bd300aad05e6f` |`2026-11-14T16:36:55.083729+00:00` |
|TWSE / 2026-11-13 |`https://www.twse.com.tw/rwd/zh/fund/T86?date=20261113&selectType=ALL&response=json` |2446461 |`3ac1060d3c66c10e034d4fddc293df1bc3f04964dd8326ab9848059f41e8734e` |`2026-11-14T16:36:58.686908+00:00` |

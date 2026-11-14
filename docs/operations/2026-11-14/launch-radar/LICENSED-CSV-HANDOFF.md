# Three licensed CSV resources — source contract

Status: source36caa9822bb905ca149661805f06ca084a9f2d21 validated539/539 +types/lint/build+33controlledbrowser; external isolated actualCSV43/43 in a17f8085aa4266824e867d094091ddd4696181a7 (blob e3cab6ed6968e4546bac19f11a9c59445164f175), not Cloud acquisition or ranking publication. Registry provenance is user-supplied observation commit `4a8a226d…`, retained as `work/ptt-official-nov15/licensed-csv.external.json`. It reports the exact routes and headers below, GovOpenDataV1 attribution and November14 collection clocks. It does not supply raw CSV bodies, earlier publication clocks or actual selected price/action cache authority. Prior JSON receipts and their hashes retain their original meaning.

## Closed registry

| Dataset | Exchange / content | Exact URL template |
| --- | --- | --- |
|[11755](https://data.gov.tw/dataset/11755) |TWSE / monthly index |`https://www.twse.com.tw/indicesReport/MI_5MINS_HIST?response=open_data&date=YYYYMM01` |
|[11391](https://data.gov.tw/dataset/11391) |TPEx / monthly index |`https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?response=data&date=YYYY%2FMM%2F01` |
|[11856](https://data.gov.tw/dataset/11856) |TPEx / daily institutional shares |`https://www.tpex.org.tw/web/stock/3insti/DAILY_TradE/3itrade_hedge_result.php?l=zh-tw&o=data&se=EW&t=D&d=ROC%2FMM%2FDD` |

Computed attribution includes dataset ID/URL, exchange, owner `Securities and Futures Bureau, Financial Supervisory Commission`, license `Taiwan Open Government Data License 1.0` and [license URL](https://data.gov.tw/license). The registry is compiled and route-specific; caller-supplied license or authority fields are not accepted. These CSV terms do not license the JSON routes or TWSE T86. T86 public raw redistribution remains closed. No paid provider, mirror fallback or FinMind call is added.

11755 header is exactly `日期,開盤指數,最高指數,最低指數,收盤指數`. 11391 is exactly `資料日期,開市,最高價,最低價,收市,漲跌`. Dataset11856 has **25 unique columns**, as actually counted in the pinned receipt:

```json
["資料日期","代號","名稱","外資及陸資不含外資自營商買進股數","外資及陸資不含外資自營商賣出股數","外資及陸資不含外資自營商買賣超股數","外資自營商買進股數","外資自營商賣出股數","外資自營商買賣超股數","外資及陸資買進股數","外資及陸資賣出股數","外資及陸資買賣超股數","投信買進股數","投信賣出股數","投信買賣超股數","自營商自行買賣買進股數","自營商自行買賣賣出股數","自營商自行買賣買賣超股數","自營商避險買進股數","自營商避險賣出股數","自營商避險買賣超股數","自營商買進股數","自營商賣出股數","自營商買賣超股數","三大法人買賣超股數合計"]
```

Foreign/trust data are found by these full unique names, with foreign net at index5 and trust net at index14. The JSON grouped-table positions4/13 are not reused. All six buy/sell/net fields are mandatory; buy/sell are safe nonnegative integer shares, reported net is a safe signed integer and exact subtraction must agree. Missing/null/unsafe/fractional values never become zero. The exact row date and single requested6488 row are required; duplicate dates/security rows reject. Other securities do not become candidate identities.

## Envelope and byte rules

Use `schema:"launch-official-licensed-csv-v1"`, `parserContract:"gov-open-data-11755-11391-11856-csv-v1"`. This is distinct from `launch-official-public-replay-v1`. All other top-level fields follow the [JSON handoff](PUBLIC-EXCHANGE-HANDOFF.md) except:

- Omit `schemaEvidence`; no grouped-HTML proof is substituted for the CSV's unique full header.
- Every response adds required numeric `datasetId` (11755,11391 or11856); its market/kind/URL must match the registry exactly.
- Response bodies remain `base64`, confined local `file`, or explicitly `absent`; unknown/missing bytes yield gaps.
- Only the registered three CSV resources are supported; a JSON URL with a licensed dataset ID is refused.

Targets remain TWSE2330/TPEx6488, signal labels2026-11-12/13. Index months are ordered unique, <=13 per market; flow dates are ordered unique, <=21 for the adjacent two labels. Global limits remain68 pages and112MiB. Every CSV page is capped at500,000 decoded bytes; index data<=31 rows/month and flow data<=5,000 rows/day. There is no preamble/footer/header guessing or invented26th/trailing column. Default header/row width is strict.

UTF8 decoding is fatal, and the CSV state machine supports a single initial BOM, CRLF or LF records, doubled quotes, quoted commas and quoted newlines. Unclosed/interior/misplaced quotes, extra trailing tokens, changed headers and malformed dates/numbers fail closed. Index OHLC is positive and internally consistent; no missing close is imputed. `rawSha256` hashes original bytes. `canonicalCsvRowsSha256` separately hashes decoded CSV records using the existing canonical helper. CSV is never rendered into a fake JSON URL/payload/digest.

Capture may use a validated complete GitHub tuple or all three workflow fieldsnull. Repository, source commit and ordered real capture/page clocks remain. Nonworkflow input retains `capture_workflow_identity_unverified`; no host/account identity is asserted. Cutoff must be strictly after actual capture completion. Source observation time, rather than an invented historic publication timestamp, becomes row source/availability time; `publisherPublishedAt` remainsnull.

## Callable path and remaining gates

The existing offline CLI now dispatches the CSV discriminator:

```bash
node --experimental-strip-types web/scripts/launch-official-replay.mjs --root work/allowed-private-csv --manifest work/allowed-private-csv/manifest.json
```

The allowed directory must be private0700 under this repository's `work`. Every file uses the existing descriptor/proc/size protections; errors are generic. The CLI prints attribution and hashes/counts/gaps, not raw CSV or numerical rows. This command describes a callable path; it is not a request to download data or claim the example artifact exists.

`parseLaunchLicensedCsvReplay` constructs the same private parser state consumed by `bindLaunchOfficialReplay` and the actual optional `readLaunchPatterns` seam. Only parser-created state can bind. Normalized revisions include the original CSV URL/hash/clock, parser version, full header and registry attribution. `reader.officialReplay` returns the computed attribution allowlist from private state; caller-mutated or cloned public metadata cannot register rows or claim a license.

Raw index/flow parsing can succeed independently of the selected company-price/action cache. The binder still requires the existing verified calendar,240 price history, source/action revisions and same cutoff, aligning200 index closes and20 institutional sessions. TPEx share-volume remainsnull without the separately selected exact51-native-share/CA bridge. The later11371/57-row exact-share resource is explicitly a next slice and is not implemented here. Cash-only classification, all three action feeds, original-window hold proof, publication review and release gates are unchanged. All source/entry/ranking/publication authorities remainfalse; CSV license metadata is not a grant of those authorities.

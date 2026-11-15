# Fixed11764 private historical-close replay

Source **bad5c986174ed6bd00bf4e6f2fee1abffccecb86** equals locally tested **d1ffd7bb048cfc8aef418eb4fa73752ee84e1207**, whole **261e2a92d49c421da1c6d55aa393d486a10e4189**. [50related+15actual privateCLI/types/lint/build PASS](twse-close-checks.json),0skip/fail. Engineering source review0openP0/P1 is not formalA1. These test bytes/rosters are invented; no actual source bodies were parsed in Cloud.

The existing private CLI now accepts DISTINCT launch-twse-11764-close-observations-v1/datasetId11764 and only exact registered dated CSV URL `https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?response=open_data&date=YYYYMMDD`. Source fields are payload date,index0;issuer code,index1;raw nullable close,index3. Every nonempty row must have exact9 columns and its own requestedYYYYMMDD date. Headers: 日期/證券代號/證券名稱/收盤價/殖利率(%)/股利年度/本益比/股價淨值比/財報年/季. Columns4..8 are not parsed as financial facts. No OHLC,volume,turnover,cash,institutional flow,PE basis,adjustment or price bar is fabricated.

## Exact private consume contract

Use this fixed source, existing pinned Node22 runtime and isolated readonly/no-network process:

```sh
node --no-warnings --experimental-strip-types web/scripts/launch-official-replay.mjs \
  --root work/PRIVATE_0700_DIRECTORY --manifest work/PRIVATE_0700_DIRECTORY/manifest.json
```

The exact capture/roster/response/body shapes and existing private-root/regular-file/no-follow/bounded-read protections are [BREADTH-CLI.md](BREADTH-CLI.md). Use that SAME SHAPE with schema launch-twse-11764-close-observations-v1,datasetId11764,and the fixed TWSE route/date. Supply ORIGINAL11764 nine-column body files and their own hashes, TWSE roster metadata/revision/availability, actual capture/page clocks and the intended throughSession/cutoff. Never relabel11371/11549/JSON bytes or reuse a TPEx roster as TWSE; no fictitious approval. All publisherPublishedAt remain null. Output contains bounded counts/digests/observations, not names,prices,links/raw CSV.

At most30 sessions/responses,500000bytes/page,15000000total,5000metadata roster identities and5001decoded CSV records. For two adjacent30-session windows reuse31 retained private files across TWO manifests, never accept a31-page manifest or invent a new capture clock. Wholly blank records are ignored for report rows but retained in canonical decoded-row hash; header-only/all-empty/two-byte warnings/partial-width/duplicate/wrong-date/hash/MIME/redirect/future-clock input fails. Missing bytes give decoded0/gap. Filenames/URLs/latest11549/JSON valuation labels cannot substitute payload dates.

The complete earlier TPEx parser prefix11336bytes remains exactly SHA2567e9a650a8efd21f99b7a29b3930f07535332f6d075901c022df1aab1f04f34be, including old API/schema/revision/defaults. This separate profile does not inherit11371/11370 scope or rights.

## Acceptance limits and next bridge

11764 mechanical schema is pinned by root-verified external84a975 metadata and collector/checker TEXT Gitblobs; neither external program was executed here. Actual31responses/2456852bytes and1085closeparity are external controls, not Cloud raw replay. Acquisition onNov15 cannot become known-onNov13. A wholly empty date does not prove cancellation/opening.

Owner/license/licenseURL/licenseVersion/rightsRevision stay null with permanent twse_11764_resource_license_owner_snapshot_unverified. No DB profile/publicrights/citation helper or actual reader/writer is enabled. All rights/source/roster/calendar/CA/market/publication authority false; comparable/qualified breadth and aggregate gate null, even synthetic1937/1979>95%. Original95 aggregate scope unchanged. This removes the mechanical parser gap, not rights or real market qualification.

C full-roster immutable materialization/own lease/head-first ordinary identities/current purpose/raw-captureACK/commit witness/recovery and genuinely staged<=200 planning remain unimplemented.171existing+30new cannot blindly enqueue201; pending binding never means ready. No active20 authority borrowing,oldUPSERT,source-clock backfill or duplicate research charge. True CA/calendar/cancellation and two-market authorized1/5session foreign-currency flow still required. FinMind parity withoutvenue/version/currentrights/cutoff remains disabled; never approximate currency as shares×price.

Separate324dab2 action controls distinguish theoretical ex-reference,trading base and actual limit; dfe1337 distinguishes daily liquidity from complete20-session average and independent11549scope. They do not modify old actionterms,outcomes or writer here. T07 financial-period source remains separately bound to72482e1/27f5630. NativeHOLD/A1/original PRhead/production/timers/flags unchanged. No source IO,SQL/native/PG,model/paid call or cleanup.

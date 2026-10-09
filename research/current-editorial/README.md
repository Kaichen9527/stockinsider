# Current factual editorial work (not strategy holdout inputs)

`revenue_briefs.py` parses the two official TWSE/TPEx monthly-revenue CSVs, keeps
source units and actual acquisition time, and checks arithmetic with Decimal.
`terminal_package.py` binds those facts to one captured terminal research run's
point-in-time instrument authority and immutable detail revision, using the
existing `candidate-audit-export.ts` projector. It reads local captured receipts,
not a server, and does not publish or write financial facts.

## Reproduced September 26 package

The actual captured run is `5159a811-dd93-48cb-a172-619ea4db486e`, evaluated
2026-09-25T15:26:35.589+02:00. All 220 distinct run items have matching revision,
stock and official company identity. All 220 have a checked August 2026 revenue
row in the two already-retained official CSVs. This extends the older public
175 verified issuers with 45 additional members. The old public 6000 placeholder
is not in this terminal run; it is not guessed, repaired or deleted here.

Generated results: 220 factual Markdown briefs, 220 identity/revision/numerical
checks, and 11,560 explicitly missing field/period requirements. Six of those
requirements are symbolic `latest_reported_quarter` segment periods, not invented
dates. All 220 have incomplete required quarterly financial coverage in this
particular contract. This does not assert that the whole database has zero facts.
The run's 14 successful rows have a complete P/B-reference model, not complete
quarterly statements or full investment articles; 206 other rows remain partial.

The compiled package deliberately retains:
- `full_current_app_universe_attested=false`: one terminal run is not the full App.
- `full_investment_articles_complete=0` and `published_articles=0`.
- Per-brief factual arithmetic checks, but no independent editorial publication
  acceptance, current buy price, target price, invented EPS or missing-quarter fill.

## Input identities and acquisition scope

1. Contabo repeatable-read/read-only receipt: run 36158405709 attempt 2, artifact
   10892922264. ZIP SHA256
   `15e577d4ac412a6f560d40e126cfb889720c08fc36caead01667b4b88ddd90c0`;
   observation SHA256
   `08bebee7a09f7af0217a3ff2770f5f090f66583a32e5d7118fa6ae8148ddcc88`.
   Read at 2026-09-26T00:14:50.271926Z. Available filesystem bytes were
   14,102,659,072 (13.134 GiB), already below the 15 GiB deployment floor before
   staging overhead. The three reported mount paths share a filesystem; do not sum.
2. Financial gap receipt: run 36157929821, artifact 10873674752. ZIP SHA256
   `8562c0ae78c377e585e5483f68b6d5f78be7805983f3a113793b5caf3c28d0e7`;
   observation SHA256
   `fdebc3a297f4a2b99739061b2a22d8e463188e75628b9f9bddea2dd5ac29107d`.
   The two transactions are different captures of the same immutable run; every
   used item/revision binding is compared before joining them.
3. Official revenue receipt: run 36154762318, artifact 10872902251. ZIP SHA256
   `3aa61cb15781615f1dc17cf363389dbffa9b54189b0dc40a1e651ee18bbb33a4`;
   revenue-briefs/manifest.json SHA256
   `c5884e6cfdf60cecac8ec52e760f8748d0d6b8ed28b74cda06254f5127fe041f`.
   TWSE CSV SHA256 `5409959acd465b4b31177478097b87c63604a6fcf717a6ed061d8017725b0c17`;
   TPEx CSV SHA256 `a231f3e3eb08a101a770756fecd929fd0738a802ca51b130ffdc68ae7176cc40`.
   Sources are `https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv` and `_O.csv`;
   metadata/license pages are https://data.gov.tw/dataset/18420 and
   https://data.gov.tw/dataset/56510 (Government Data Open License v1).
   The table's publication date and its later retrieval timestamp remain distinct.

The full inputs and generated package are retained as conversation attachments.
GitHub artifact retention is finite; download actual bytes rather than assuming a
URL is permanent. Raw credentials, private article text and server environment
files are not inputs to or outputs of this tool.

## Reproduce without network

Use extracted copies of the three identified artifacts, and a new output path:

```sh
python -m unittest discover -s research/current-editorial -p 'test_*.py' -v
node --experimental-strip-types --test web/src/lib/candidate-audit-export.test.ts
python research/current-editorial/terminal_package.py \
  --readiness /path/readiness/observation.json \
  --gaps /path/financial-gaps/observation.json \
  --revenue-dir /path/editorial/revenue-briefs \
  --expected-readiness-sha256 08bebee7a09f7af0217a3ff2770f5f090f66583a32e5d7118fa6ae8148ddcc88 \
  --expected-gap-sha256 fdebc3a297f4a2b99739061b2a22d8e463188e75628b9f9bddea2dd5ac29107d \
  --expected-manifest-sha256 c5884e6cfdf60cecac8ec52e760f8748d0d6b8ed28b74cda06254f5127fe041f \
  --output /path/new-editorial-output
```

The 32 Python tests include 22 new reconciliation tests and a real local Node
projection. The existing 20 candidate-projector tests are a separate suite.

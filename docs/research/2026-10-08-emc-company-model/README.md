# EMC conditional model and working article

This is an unpublished current research draft, not qualified research, a calibrated target, automatic entry, model reservation, or business roundtrip. Exact data subjects: ab2fda19 (officialfinancial/monthly/268rawbars/context) and4b3f4201 (newmedia+officialEPS/product/nonopnotes). Root relayed Astra unsigned scoped DATA pass for each; model/article review pending. Raw acquisition files remain on root/Mac; VM uses attributed selected data, verifies Git input hashes and calculations, does not claim VM raw acquisition or original-byte hash verification.

Rebuild with existing Node22:

```
node --experimental-strip-types docs/research/2026-10-08-emc-company-model/recompute.mjs 2026-10-08T12:12:00Z
node --experimental-strip-types --test scripts/research-emc-company-model.test.mjs
python docs/research/2026-10-08-emc-company-model/verify-output.py
```

`recompute.mjs` consumes five exact relays, converts financialthousands/monthlyTWD to millions, checks real signed income bridges,24continuousmonths,268validorderedrawsessions and nanosecond observation bounds. It uses existing consolidated-profit/technical/valuation helpers and AUO's reviewed ordinary/potential EPS helper, with EMC-specific consolidated revenue/gross/expense assumptions. No AUO segment economic rates or paper trade plan is imported. Shared `scripts/lib/research-model-article.mjs` renders tables and required tokens; this is a reusable text rendering primitive, not a new publisher/API.

Q2/H1 product revenue splits include prepreg/CCL/Other and reconcile, but high-grade mix, utilization, yield, ASP and grade-level profit remain null. Capacity is a dated plan, not actual delivered output or fixed orders. Official EPS note ordinary358.321m is explicit future carryforward assumption; Q2diluted358.417/H1diluted358.497 and2025convertible numerator adjustments retained. Annual2026 carries reportedH1 employee176k with half-year weight; future2026 quarters assume no additional potential awards; 2027tests0.5/1% award-only sensitivity with no numerator adjustment. Potential shares excluded for loss; ordinary issuance remains period-weighted. Actual future issuance/instruments unknown.

Separate calendar2026 actualH1+forecastH2, calendar2027 forecast4quarters and forward4unreported2026Q3–2027Q2. Q3knownmonthly60884.517m remains preliminary and not exactquarterfinancial revenue or reportedEPS; seven historical discrepancies retained. Net nonop is bankinterest+FX+othergains excludingFX-financecost; FX is not counted twice. New actual notes reconcile; future components/tax/NCI are explicit assumptions, not full normalization. Currentmedia187–226EPS/38%GM is attributed expectation, not unnamedbroker-original-read, officialguidance/order/fullconsensus. Reverse revenue/margin varies one axis holding base inputs; not adopted base or PE ceiling. Historical2025Yuanta53.61/24/1300/7.6 stays historical.

Raw technical diagnostic uses existing `calculateTechnicalSnapshot`: first-close EMA seed, RSI initial14 actual deltas, ATR initial14 TRs excludes firstbar TR. This differs from AUO-market calculator seed conventions and is explicitly versioned; no silent switch. Aug28X0.00 remains named; no adjusted or total return, officialcompletecalendar/flows/benchmarkqualification/entry. Existing calendar helper can return diagnosticstale=false; that does not establish complete official source authority.

Private focused/Decimal/types/lint/normalbuild receipts and failure chronology are listed in handoff/report. Web lint covers web source; newMJS/Python checked by executable focused/independent calculation and Node parsing. No app changes; no full unrelated suite rerun. Preview using existing read-only article contract is next scoped work; Markdown-only is not publication验收.

## P3 sensitivity correction

The 2027-base PE sensitivity now consistently uses assumed diluted weighted shares360.112605m; its shareBasis field labels the future assumption. PE40 requires rounded owners income54017m versus the original basic-basis53748m. Main article, scenario EPS and evidence remain unchanged. The original a7a96c2 snapshot and its unsigned scoped working-draft review remain historical; this successor correction awaits review.

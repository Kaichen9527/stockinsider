# T09 launch outcome calculator

The candidate consumes a versioned rank signal, an as-of market calendar and a selected common price basis. It follows each signal at 20, 60 and 120 market sessions. The research series starts from the frozen close. The execution series considers the open of the next official market session and requires opening evidence tied to the raw print and price revision. A confirmed unfillable opening stays unfillable as later sessions arrive. Insufficient evidence leaves the execution series unresolved.

The 20-session first-touch result compares exact decimal prices for +20% and −15%. A verified opening at a barrier settles before the intraday range; a day with both touches and an open between the barriers remains order-unknown. Missing earlier evidence prevents a later observation from claiming to be the first touch. A confirmed early touch and later horizon maturity are separate results. Future prices and clocks, duplicate bars, incompatible price bases and misplaced opening receipts are rejected.

Research barriers use gross price movement. The simulator keeps separate gross and net barriers so the fixed commission, sell tax and two-sided slippage assumptions can be compared. The horizons remain aligned to the signal's following market sessions. The reopening of an individual stock cannot redefine the next market day. The caller must provide the same verified, versioned corporate-action basis for the signal and subsequent observations. This slice reports price returns and does not invent dividend proceeds or a new adjustment formula.

Identity stays stable within each published ranking-run and symbol while the as-of evidence grows. Historical replays use a separate namespace. Repeated rankings carry the original signal ID and are marked separately. This calculation exposes only a closed signal projection.

## Verified

The exact source dependency closure passed strict TypeScript 5.9.3. The non-root Node 22.23.1 probe in isolated Contabo staging passed 16 cases. The actual 5274 replay used six trading dates verified against the TPEx index series and official daily quotes. Starting from the Nov 5 historical control, the research series first reached the down barrier on Nov 10, its third market session. Opening eligibility was unknown, so the evaluator did not model a fill. All three horizons stayed pending after six sessions. This observation was collected Nov 15. It does not establish an earlier published signal or executable order.

## Reproduce and integrate

Apply the patch to `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43`. On the approved isolated Linux staging host, pass the disposable checkout root and the companion Node probe path to the Python replay script. It samples only the two identified TPEx reports, pins the observed response digests, reads the selected rows in temporary storage and runs the tests in a network-isolated non-root process. Keep a replay as a research control if the live response digest changes.

The writer still needs to bind an actual published ranking member, assign first and repeated signal identity, obtain normalized price and opening authority, and append idempotent revisions. Schedule and UI read integration, simulated no-fill against actual accepted authority, and the production verification remain pending.

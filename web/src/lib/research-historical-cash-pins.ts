/* Exact candidate-source inventory; private bytes only, no source authority. */
function freeze<T>(value:T):T { if(value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export const historicalCashPins = freeze({
  "profile": "oct14_historical_cash_v1",
  "sourceCommit": "15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb",
  "packetPath": "docs/research/2026-10-14-cashflow-capital-addendum/source-packet.json",
  "limits": {
    "carrier": 1048576,
    "perFile": 524288,
    "aggregate": 1048576,
    "projection": 160000
  },
  "companies": {
    "2409": {
      "carrier": { "bytes": 931023, "sha256": "823b80038e13779f4155327b3cd7d36b1dc5a833490da1bf692d33845c239590" },
      "files": [
        {
          "path": "docs/research/2026-10-08-auo-four-segment-model/model-results.json",
          "bytes": 113823,
          "sha256": "6426ba0caaac2a446593a632ebce50f93e7851f4fdb4025ff427c2f011961209"
        },
        {
          "path": "docs/research/2026-10-08-auo-full-financial/financial-relay.json",
          "bytes": 19837,
          "sha256": "524a72ca86f7a653050d97d0a7cfea57046ebf7b2d922f614d6070cc7753decf"
        },
        {
          "path": "docs/research/2026-10-08-auo-full-financial/historical-income-relay.json",
          "bytes": 40271,
          "sha256": "f56d8d4da10af9da518e22fe7539d4e210bc9a229a1185c75175f1f1887e94bb"
        },
        {
          "path": "docs/research/2026-10-08-auo/dataset.json",
          "bytes": 86638,
          "sha256": "d231112310925906da455fd87aced084ee25b0943a719ed7b8896bf350602a4a"
        },
        {
          "path": "docs/research/2026-10-08-auo-market/dataset.json",
          "bytes": 393280,
          "sha256": "3de3a52fd589376621581f0bbd1578dfb4b011afd168277078aae85ace6a2582"
        },
        {
          "path": "docs/research/2026-10-08-auo-full-financial/guidance-relay.json",
          "bytes": 2910,
          "sha256": "97a0acc32dc7d3f6cb7be4a30ffc5fc26edc708ead3c709c20900ddb2d0c9189"
        },
        {
          "path": "docs/research/2026-10-08-auo-full-financial/ownership-relay.json",
          "bytes": 3549,
          "sha256": "cb6e81280a3c05bc5057bd2a7fb843e0ea9e2c878dad24107deeefbc8f3738b6"
        },
        {
          "path": "docs/research/2026-10-08-auo-full-financial/technology-context-relay.json",
          "bytes": 6599,
          "sha256": "8923a9d0aab75e9f70944de645e9076a24c98865b55e30f03f88623d2eb23103"
        },
        {
          "path": "docs/research/2026-10-14-cashflow-capital-addendum/source-packet.json",
          "bytes": 30651,
          "sha256": "b3cdd1b865ef31e7df7db715697e6137a0eb5112139d88e8af337ae3f15030a3"
        }
      ],
      "modelCanonicalHash": "cf7419b2204419dc1aca590bc355df36bb19600c5beaf2905c6819f5a040b57d",
      "metrics": [
        "pretax",
        "depreciation",
        "amortization",
        "fvGain",
        "interestExpenseAdjustment",
        "interestIncomeAdjustment",
        "dividendIncomeAdjustment",
        "shareCompensation",
        "equityMethodAdjustment",
        "ppeDisposalGainAdjustment",
        "rouDisposalLoss",
        "heldForSaleGainAdjustment",
        "investmentGainAdjustment",
        "impairment",
        "unrealizedFx",
        "otherAdjustment",
        "receivables",
        "relatedReceivables",
        "inventory",
        "contractCosts",
        "otherOperatingAssets",
        "contractLiabilities",
        "payables",
        "relatedPayables",
        "provisions",
        "otherOperatingLiabilities",
        "generatedCash",
        "interestReceived",
        "dividendReceived",
        "interestPaid",
        "taxPaid",
        "operatingCash",
        "ppeCash",
        "intangibleCash",
        "ppeDisposalCash",
        "heldForSaleDisposalCash",
        "subsidiaryDisposalCash",
        "investingCash",
        "shortBorrowings",
        "shortRepayments",
        "longBorrowings",
        "longRepayments",
        "leasePrincipal",
        "financingCash",
        "fxCash",
        "cashChange",
        "openingCash",
        "closingCash",
        "revenue",
        "netProfit",
        "ownersNetProfit",
        "nonControllingNetProfit"
      ],
      "issuerIndex": 0,
      "aggregateBytes": 697558
    },
    "2383": {
      "carrier": { "bytes": 353803, "sha256": "5fff5dd7e33ae7da30d8b72890f13414866b7820f54685af38b5cdd95d2b5564" },
      "files": [
        {
          "path": "docs/research/2026-10-08-emc-company-model/model-results.json",
          "bytes": 71848,
          "sha256": "30028ccf9e48d7cda79f55a8b6ffd5141bad513e277894c8e360479e606b6786"
        },
        {
          "path": "docs/research/2026-10-08-emc-official-evidence/financial-relay.json",
          "bytes": 33734,
          "sha256": "e4057879306d45e7c1be62a17c8047644806881fe01f5ffd7903f5523aa84ac0"
        },
        {
          "path": "docs/research/2026-10-08-emc-official-evidence/market-relay.json",
          "bytes": 110526,
          "sha256": "fdb0712fe490aaeb719d382d689bfbe4e17213c8a79957c6d238c642d61c7de5"
        },
        {
          "path": "docs/research/2026-10-08-emc-official-evidence/context-relay.json",
          "bytes": 10693,
          "sha256": "8f3b7778866ebcfd91f4d1c2c3a756fdf56173f8323ecf52faba9ed66d1800a5"
        },
        {
          "path": "docs/research/2026-10-08-emc-official-evidence/financial-notes-relay.json",
          "bytes": 3630,
          "sha256": "07136fe1b389b512232b5637b5fa3d7cb1f02f77f170a9ba7746139b37593275"
        },
        {
          "path": "docs/research/2026-10-08-emc-official-evidence/current-media-relay.json",
          "bytes": 3671,
          "sha256": "59c90fb0661f54da7cd1432e54acabe3a85fa74983f8d27aeef7d1ecff73975d"
        },
        {
          "path": "docs/research/2026-10-14-cashflow-capital-addendum/source-packet.json",
          "bytes": 30651,
          "sha256": "b3cdd1b865ef31e7df7db715697e6137a0eb5112139d88e8af337ae3f15030a3"
        }
      ],
      "modelCanonicalHash": "d10858110edee1dd2760791e00c8b0eea3dc4a80b6d643db70b62216541dc879",
      "metrics": [
        "pretax",
        "nonCashAdjustments",
        "operatingAssetChange",
        "operatingLiabilityChange",
        "workingCapital",
        "adjustmentsTotal",
        "receivables",
        "notesReceivable",
        "inventory",
        "payables",
        "generatedCash",
        "interestReceived",
        "interestPaid",
        "taxPaid",
        "operatingCash",
        "ppeCash",
        "intangibleCash",
        "rouCash",
        "ppeDisposalCash",
        "investingCash",
        "shortBorrowingsNet",
        "longBorrowings",
        "longRepayments",
        "leasePrincipal",
        "financingCash",
        "fxCash",
        "cashChange",
        "openingCash",
        "closingCash",
        "revenue",
        "netProfit",
        "ownersNetProfit",
        "nonControllingNetProfit"
      ],
      "issuerIndex": 1,
      "aggregateBytes": 264753
    }
  }
} as const);

# T06 and T10 listed company roster reconciliation

On 2026-11-15, the existing offline exchange replay ran on pinned Node v22.14.0 with the three government catalog resources. Capture completed on Contabo staging. Replay was unprivileged and network-isolated. Temporary source files were removed. Four profile cases and fifteen existing CLI cases passed. [Structured receipt](../../openspec/changes/stockinsider-vnext-20/evidence/2026-11-15-t06-listed-roster-source-replay.json)

| Venue | Company rows | Four-digit company codes | Corroborated by custody | Custody market mismatch |
|---|---:|---:|---:|---:|
| TWSE | 1,099 | 1,093 | 1,091 | 2 |
| TPEx | 897 | 897 | 896 | 1 |

All three bodies carry the November 15 source date. The replay marks them after the November 13 cutoff and ineligible as evidence for that session. The counts and digests expose no source rows, names, or contact fields. The code keeps market mismatch, corporate-action custody flags, future listing and conflicting venue claims visible. A custody flag cannot distinguish suspension from legal delisting or bind an issuer to the exchange registry.

The next capture needs a canonical close-clock, admissible trading status from the exchange and a current instrument manifest. These are needed before computing an exchange-wide denominator. The existing ranking and operating schedules were untouched. [TWSE suspension dataset](https://data.gov.tw/dataset/11677), [TPEx suspension history](https://data.gov.tw/dataset/48665), [TPEx daily status](https://data.gov.tw/dataset/11736)

Data attribution, 2026. 金融監督管理委員會證券期貨局／臺灣證券交易所，上市公司基本資料 18419，2026-11-15. 金融監督管理委員會證券期貨局／證券櫃檯買賣中心，上櫃公司基本資料 25036，2026-11-15. 金融監督管理委員會證券期貨局／臺灣集中保管結算所，證券基本資料 11425，2026-11-15. The resources are released under the Taiwan Open Government Data License v1.0, subject to its conditions and attribution obligations. [上市公司基本資料](https://data.gov.tw/dataset/18419), [上櫃公司基本資料](https://data.gov.tw/dataset/25036), [證券基本資料](https://data.gov.tw/dataset/11425), [政府資料開放授權條款－第1版](https://data.gov.tw/license)

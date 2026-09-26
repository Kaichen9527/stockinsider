# Offline official-response fixtures

These small JSON responses were retrieved from the public official endpoints on
2026-09-25 UTC. They are parser examples, not evidence that an historical
publication timestamp or unrevised historical snapshot has been verified. The
test file also constructs explicitly synthetic malformed responses to exercise
failure handling. Running the tests does not contact the network.

| File | Official source URL | SHA-256 of the retained bytes |
| --- | --- | --- |
| `twse_2330_202309.json` | https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=20230901&stockNo=2330 | `22d8041a517243a5b90f18d01a53e81947d4d0ac386f0dc063255abf6a333697` |
| `tpex_6488_202309.json` | https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=6488&date=2023/09/01&response=json | `55542e82fa0d4730786ea0f54e18d2a0f00aa4d587fc94d75413e37cce8085c4` |
| `taiex_total_202309.json` | https://www.twse.com.tw/rwd/zh/TAIEX/MFI94U?response=json&date=20230901 | `fc178cee08a26ca5800212acbd8f84ce825a0d07384cfe86e8cc559652c5fa40` |
| `twse_2330_exright_detail_20230914.json` | https://www.twse.com.tw/rwd/zh/exRight/TWT49UDetail?STK_NO=2330&T1=20230914&response=json | `b10f82bd20df4602172c92228fa53f40676c5db1ff1a1870f8aac26bc5c5e356` |
| `twse_2881_exright_detail_20230904.json` | https://www.twse.com.tw/rwd/zh/exRight/TWT49UDetail?STK_NO=2881&T1=20230904&response=json | `24340dd923ef904abbf652708fc2e4b226dbbadefd5dca8a202abb370edc4718` |

The TPEx monthly response reports volume in thousands of shares and turnover in
thousands of TWD. Multiplication by 1,000 normalizes units; it does not recover
precision absent from that source. Dividend detail reports explicit cash per
old share and free shares per 1,000 old shares. A free-share amount alone does
not establish when the new shares become tradable.

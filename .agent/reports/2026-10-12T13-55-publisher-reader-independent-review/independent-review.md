# Genuine independent scoped review — REQUEST_CHANGES

Reviewer: existing authorized `/root/author_input_review_oct08`, actual final message this turn. Unsigned scoped engineering review; not protected approval.
Delivery c03265a84abfeef4271b5dcd33f187cf907afb90; runtime64b71a91c45fd1fc73f0937c608290d31d60bddd; delivery tree251f7b6f3adcdc36c5d9811be5a5d1e3e604a3e0.

P0=0 / P1=0 / P2=1. The reviewer independently executed 52 original pure tests (52PASS/0FAIL/0SKIP) with exact blobs and additionally reproduced the known-invalid-head counterexample in both input orders. No DB, build, install, crawl or CI execution by reviewer.

P2: reader.ts193–194 filters published_at>cutoff before family head selection at220–221. Keep original fixture rev2 and its verification; add same-family rev20, recorded_at=cutoff12:00:00.123456Z, collected_at11:00:00.123456Z, published_at=cutoff+1us. Both input orders return projected, null reason, old rev2 publisher binding; new head receives after_cutoff. The new row was already collected and recorded, so its invalid claimed publication date cannot make it unknown and revive old content. Actual existing SQL17483–17503 selects heads using collected/recorded availability then validates published<=collected. Fix family selection first, invalidate illegal publication on selected head, preserve real future-recorded/collected exclusion and correct the old tests that asserted the faulty behavior.

Reviewer checked existing relation columns/native publisher layout, manifest row/page/root chain, microseconds, inactive/incomplete head, local count envelope and explicit false/null capability boundaries; no other confirmed P0/P1/P2 this scope. This is not live source verification or investment admission. Root separately reproduced the same two outputs; root probe exit0 means bug reproduction, NOT closure.

Reader SHA335e17d1f35a5a82c141243709042101213e0f3b4795b55e367b6c1108d1c922; tests SHA5f2c06666e1615f164f79974daeb4a928cd1819fdae9d8601c9481b88ea76ed9; actual whole migration SHAfd20c4cde636943ddc878419a61888b25a08387eed05f8554b3a2a7043ec10f7; actual SQL excerpt SHAeb47ebefdcc734fe87793fe198af6675c5d6601418e783ea8fc0a1833ac78de5.

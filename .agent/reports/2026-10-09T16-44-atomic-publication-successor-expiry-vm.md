# Linux expiry-only successor acceptance

Original exact18d acceptance remains sealed at `7e2ca6a764a7f447fbf10266feea555e5cac4f88` (759/757/0/2). This separate run adopts only the expiry test delta from `77a84448c52739cd4a8c7725df1103d96a26512f` at local test head `4ea06752a340c41222ae9309a5ccaca9bb74dfef`. Runtime, web, migrations and package are unchanged.

Single expiry-only command: 2 tests (one parent + one child), 2 pass, zero fail/skip; wall 31.906s. Original short synthetic lease was sealed before execution; real remaining-clock wait and source fence let that original deadline expire. No extension or writes were accepted. The reused exact18d build `GSmt2-9hVUeJ5PJ9H3Roy` was verified against all2092 original manifest files; no rebuild.

Sampled RSS peak198623232B, free10974928896B after run; no owned process remains. Original test-owned cluster cleanup is unchanged; no manual deletion. Raw command, output, resource time and SHA are in the JSON receipt. OriginalMac psql timeout remains unexplained; this pass is not retrospective proof of its cause. All synthetic model/controller fixtures remain clearly synthetic. No actualmodel, publication, protected review, production write, merge or deployment.

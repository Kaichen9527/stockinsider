# T17 portable restore orchestration SOURCE contract — live remains disabled

Parent source fix: `511f0dcb4a61658635df08b008dbc2f0e09d0b0b`. The separate
`t17-onsite-pg17-fixture-report.json` records the coordinator's subsequent positive
public-fixture observation, not a Cloud observation or formal backup acceptance.

`deployment/staging/vnext/t17_keyfd/restore_orchestration.py` pins an ordered,
closed contract for the future real-backup adapter. It imports no process/IO,
keystore, SQL or connection client. It fixes source references at protection
revision `9bca1e30b3f6d481c722fcc33f12f93cc286749e`; the exact original TOC filter,
portable bootstrap and data-plane migration blob SHAs were checked through the
repository provider. None is executed by this contract.

Order: independent runtime admission -> host lock/current capacity -> dedicated
sandbox -> trusted complete set -> independent external keystore -> immutable
held ciphertext -> complete authentication before consumers -> bounded TOC list
-> existing JS TOC portability filter -> new PG17/C/UTF8 cluster/database ->
existing bootstrap -> owner/ACL-preserving restore with filtered list -> exact
compat migration -> restored-only identity-fence disable/activation clear ->
original owner/RLS/app/fence checks plus reviewed ownership/lineage policy ->
complete-set checks -> owned child shutdown/FD close -> continuity/cleanup and
host-lock release LAST. Failed prerequisites prohibit further consumers.

The contract carries the original15 exclusion descriptions,14 compatibility
roles,4 data-plane tables/6 functions,7 app tables/3 functions and historical
validation predicates. It does not silently widen TOC exclusions or treat
positive counts as sufficient trusted ownership policy. The historical SQL only
disarms the restored copy; production identity/fences are never touched. Sandbox
mounts/network/env must exclude production, even for an authenticated SQL archive.
External secure keystore and complete member provenance remain separate gates;
this source neither reads a key nor accepts an artifact path.

Every valid prefix AND the complete phase trace stays SourceOnly with execution,
restore and acceptance flags false and excluded from constructor arguments.
`execute_real_backup_restore()` unconditionally throws for booleans, receipts,
FDs, callbacks and full traces. The plan is reviewable source, not an adapter or
permission. A future executable adapter must implement OS-enforced bindings and
the reviewed process/stream lifecycle; model/manual checkboxes cannot promote it.

7/7 source-contract tests pass; combined retained Python suite33/33 passes.
Independent engineering reviewer independently ran7/7 and compared historical
bootstrap/restore/migration/disarm/check order against the pinned reference
runner, with zero open P0/P1 in this CLOSED source-only scope. This is not formal
A1, positive real-backup execution or a waiver of HOLD/CI/build/release gates.
The full exact-branch web build/types/lint remain NOT_RUN due full-checkout Git
CONNECT503. The separate executable portable-SQL fixture adapter is subsequent
work, not something these tests claim to have implemented or exercised.

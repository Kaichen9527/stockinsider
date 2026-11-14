# T17 constraint migration audit — source only, snapshot state UNKNOWN

This is a read-only source audit for the requested 2026-11-15 handoff. It does
not run SQL, inspect a database/backup/key, validate a constraint or change an
engine/gate. The coordinator reports that the real-backup staging run reached
`lineage_structure_rejected` after346.254s, following GCM/TOC/PG17/restore/
compatibility/basic portable checks. No constraint counts were available in that
report. This audit does not independently observe those runtime results.

## Exact commit and scan scope

- Staging subject: **`5b65286c02bc2f3e64030b6ba6c15eb83315e3d4`** (resolved from
  reported `5b65286`), tree `602af7975b66e47e285a2bfc8a512e4b2c95d20d`.
- Original protection baseline: **`9bca1e30b3f6d481c722fcc33f12f93cc286749e`**,
  tree `0f50a968f2ffbf82054a269ac5b3d33d6f623344`.
- Both complete GitHub recursive trees were untruncated and contained156
  `migrations/**/*.sql` blobs. Their migration path/blob sets are identical.
  The126 existing local migration files matched the staging tree's Git blob
  hashes exactly; all30 remaining files were fetched at the exact staging SHA.
  All156 were scanned for `NOT VALID`, `VALIDATE CONSTRAINT`, the relevant
  constraint names and the seven fixed join-column definitions. Key excerpts
  below were also fetched directly through the provider at the staging SHA.

These are source declarations/candidate preconditions, not proof that a migration
was applied, completed, subsequently changed or present in the restored snapshot.

The coordinator additionally identifies the reported backup as a2026-09-19
member. That report is not independently inspected here. Source filenames and
their apparent chronology do not establish deployed schema or snapshot contents.
In particular the20260920 valuation replacement and20261022 candidate below are
later-labelled source, not evidence of what was inside that earlier backup.

## Why the current generic failure can be ambiguous

At the staging subject,
[`portable_restore_engine.py:209`](https://github.com/Kaichen9527/stockinsider/blob/5b65286c02bc2f3e64030b6ba6c15eb83315e3d4/deployment/staging/vnext/t17_keyfd/portable_restore_engine.py#L209)
counts **all public constraints with `NOT convalidated`**, without distinguishing
CHECK from FK. Lines212–213 reject when that count is nonzero OR public FK count
is less than1. The fixed row-lineage anti-joins begin later at line218.
Therefore this error does not by itself establish an orphan, an invalid FK, a
failed anti-join or even which branch of the two-part predicate failed.

The source contains deliberately unvalidated CHECK declarations. In one case,
a later source candidate explicitly requires the unvalidated state. A nonzero
generic count must not be relabelled as corrupt rows without additional evidence.
Conversely these declarations do not prove that the reported snapshot contains
only known CHECKs; actual types/counts and definitions remain **UNKNOWN**.

## Every explicit NOT VALID / VALIDATE occurrence in the migration corpus

All references below bind to `5b65286c02bc2f3e64030b6ba6c15eb83315e3d4`; the
migration bytes are identical at `9bca1e30…`.

| Source path and lines | Declared behavior | Source-supported conclusion |
|---|---|---|
| [`migrations/20260811_actionability_recovery_v3_14.sql:725`](https://github.com/Kaichen9527/stockinsider/blob/5b65286c02bc2f3e64030b6ba6c15eb83315e3d4/migrations/20260811_actionability_recovery_v3_14.sql#L725), ADD/CHECK at726–727; VALIDATE at728–729 | `opportunity_projection_acceptance_v3_14_check` is created NOT VALID, then explicitly validated in the same migration block. | A successfully completed unchanged migration intends a validated constraint. Snapshot application/state is not observed. |
| [`migrations/20260906_candidate_dossier_v4.sql:62`](https://github.com/Kaichen9527/stockinsider/blob/5b65286c02bc2f3e64030b6ba6c15eb83315e3d4/migrations/20260906_candidate_dossier_v4.sql#L62), DROP/ADD/CHECK at63–67 | `candidate_research_dossiers_paid_content_check` restricts paid-content markers, explicitly NOT VALID. | No later migration in this corpus validates this name. The source does not certify older rows satisfy it. Do not expose content while diagnosing. |
| [`migrations/20260907_evidence_valuation_contract_v6.sql:70`](https://github.com/Kaichen9527/stockinsider/blob/5b65286c02bc2f3e64030b6ba6c15eb83315e3d4/migrations/20260907_evidence_valuation_contract_v6.sql#L70), DROP/ADD/CHECK at71–75 | `opportunity_financial_facts_v3_validation_status_check` allows validated/pending/rejected/stale/conflict, explicitly NOT VALID. | No later VALIDATE for this name. A later candidate additionally requires precisely this CHECK to remain unvalidated (next section). |
| [`migrations/20260907_evidence_valuation_contract_v6.sql:137`](https://github.com/Kaichen9527/stockinsider/blob/5b65286c02bc2f3e64030b6ba6c15eb83315e3d4/migrations/20260907_evidence_valuation_contract_v6.sql#L137), DROP/ADD/CHECK at138–146 | `candidate_research_run_items_valuation_method_check` permits NULL or a listed valuation identity, explicitly NOT VALID. | Later replaced by the20260920 definition, which also remains NOT VALID. |
| [`migrations/20260914_taiwan_provider_attempt_size_v9.sql:8`](https://github.com/Kaichen9527/stockinsider/blob/5b65286c02bc2f3e64030b6ba6c15eb83315e3d4/migrations/20260914_taiwan_provider_attempt_size_v9.sql#L8), ADD/CHECK at11–13; VALIDATE at15–16 | `taiwan_data_provider_attempts_v5_response_bytes_check` changes the allowed transport-size range and explicitly validates it in the same transaction. | A successfully committed unchanged migration intends a validated constraint. Snapshot application/state is not observed. |
| [`migrations/20260920_auo_forward_bvps_pb_contract_v1.sql:24`](https://github.com/Kaichen9527/stockinsider/blob/5b65286c02bc2f3e64030b6ba6c15eb83315e3d4/migrations/20260920_auo_forward_bvps_pb_contract_v1.sql#L24), DROP/ADD/CHECK at25–33 | Replaces `candidate_research_run_items_valuation_method_check`, adding `forward_bvps_pb`, again NOT VALID. | No later migration in the corpus validates this replacement. It is an intentional schema declaration, not evidence that its inherited rows have been checked. |

These are six explicit NOT VALID additions across five files, including two
revisions of the same valuation-method name. Two additions immediately VALIDATE.
The three remaining distinct CHECK names are **source candidates for explaining
a generic unvalidated count**, not an assertion that the actual count equals3.
No explicit NOT VALID FK addition was found in these156 migration files.
That does not prove every FK in a particular snapshot is validated or unchanged.

## Strong evidence against blanket validation

The earliest exact named financial-status constraint creator found in this
corpus is
[`20260907_evidence_valuation_contract_v6.sql:63`](https://github.com/Kaichen9527/stockinsider/blob/5b65286c02bc2f3e64030b6ba6c15eb83315e3d4/migrations/20260907_evidence_valuation_contract_v6.sql#L63):
lines63–69 add the status column/default and validation dimensions, and70–75
drop/re-add `opportunity_financial_facts_v3_validation_status_check` as NOT VALID.
Its blob is `44da6b3d32f953dbf2050f9faef26039e933b4a9`. This earlier-labelled
source could inform a future exact-profile diagnostic; it does not prove the
migration was applied before the reported2026-09-19 backup or that the named
constraint exists/has that state in the actual restored database.

[`migrations/20261022_vnext_financial_status_text_v1.sql:45`](https://github.com/Kaichen9527/stockinsider/blob/5b65286c02bc2f3e64030b6ba6c15eb83315e3d4/migrations/20261022_vnext_financial_status_text_v1.sql#L45)
checks the exact predecessor column/catalog profile. **Line47 explicitly requires**
the named financial-status constraint to have `contype='c' AND NOT c.convalidated`
and the exact five-value CHECK expression. Line48 rejects profile drift. Lines53–60
allow only the writer-body repair and require the rest of the namespace/authority
catalog to remain unchanged. This candidate's own introductory comments at1–4
state that it is additive source and does not imply production/native approval.

Thus making every public constraint validated is not a neutral compatibility
action: it would change a catalog bit that this exact source candidate guards.
The candidate is not evidence it was deployed or that the actual snapshot has
that profile. Its later20261022 filename must not be used to attribute this guard
or state to the reported2026-09-19 backup. It is relevant to future validation
design and sufficient evidence **not to recommend blanket validation** merely
from a generic count. The immediate Sep19 snapshot explanation remains UNKNOWN.

## Fixed LINEAGE_EDGES columns match declared public relationships

The engine's seven edges and its two nullable exceptions appear at
[`portable_restore_engine.py:32`](https://github.com/Kaichen9527/stockinsider/blob/5b65286c02bc2f3e64030b6ba6c15eb83315e3d4/deployment/staging/vnext/t17_keyfd/portable_restore_engine.py#L32)
through44. Their migration declarations are:

| Engine edge | Pinned source declaration | Nullable/delete semantics |
|---|---|---|
| `candidate_source_mentions.stock_id → stocks.id` | [`20260830_source_ranking_v2.sql:72`](https://github.com/Kaichen9527/stockinsider/blob/5b65286c02bc2f3e64030b6ba6c15eb83315e3d4/migrations/20260830_source_ranking_v2.sql#L72) | NOT NULL, FK ON DELETE CASCADE |
| `candidate_source_mentions.source_run_ledger_id → source_run_ledger.id` | Same file, line74 | Nullable, FK ON DELETE SET NULL |
| `candidate_research_run_items.stock_id → stocks.id` | [`20260831_candidate_shadow_performance.sql:78`](https://github.com/Kaichen9527/stockinsider/blob/5b65286c02bc2f3e64030b6ba6c15eb83315e3d4/migrations/20260831_candidate_shadow_performance.sql#L78) | NOT NULL, FK ON DELETE CASCADE |
| `candidate_research_run_items.run_id → candidate_research_runs.id` | Same file, line77 | NOT NULL, FK ON DELETE CASCADE |
| `official_price_history.stock_id → stocks.id` | [`20260901_source_research_shadow_v2.sql:118`](https://github.com/Kaichen9527/stockinsider/blob/5b65286c02bc2f3e64030b6ba6c15eb83315e3d4/migrations/20260901_source_research_shadow_v2.sql#L118) | NOT NULL, FK ON DELETE CASCADE; stock/session composite PK at129 |
| `candidate_detail_snapshots.stock_id → stocks.id` | Same file, line199 | NOT NULL, FK ON DELETE CASCADE |
| `candidate_detail_snapshots.research_run_id → candidate_research_runs.id` | Same file, line211 | Nullable, FK ON DELETE SET NULL |

No later migration in the audited corpus was found changing these join-column
declarations. This establishes source consistency of the seven selected edges,
not actual snapshot column types, validation bits or zero orphan counts. Other
relationships exist (for example mentions.source_document_id at20260830 line73
and details.market_evidence_snapshot_id at20260901 line210); the seven selected
anti-joins do not constitute complete business-lineage verification.

## Safe next decision, without remediation in this audit

1. Keep the existing failure closed. The coordinator's proposed bounded public
   constraint counts grouped by fixed `contype`, plus FK count, are the minimal
   diagnostic needed to distinguish the predicate branches. Emit no row values,
   constraint names/definitions, SQL or raw logs in the public receipt.
2. If invalid FK/other unexplained classes appear, or FK count is zero, do not
   dismiss them as these source-declared CHECKs. Current row/constraint state is
   still unknown until a separately reviewed diagnostic establishes it.
3. A separately reviewed minimal diagnostic may count exact source-bound known
   CHECK profiles (such as the paid-content declaration at20260906 lines62–67)
   without emitting names/expressions/rows. This audit grants no validation or
   admission exception. A generic count alone cannot identify a known profile;
   exact tuple matching is diagnostic evidence only, not permission to ignore it.
4. Source supports an intended validated state only for the two explicit
   ADD-then-VALIDATE cases above, conditional on the actual exact profile matching
   that migration and on a separately reviewed, bounded validation of the **new
   restored sandbox copy**. It does not justify executing validation now.
5. For the three deliberately unvalidated CHECK profiles, no later source VALIDATE
   obligation was found; one candidate expressly depends on remaining unvalidated.
   Do not validate all checks merely to satisfy a generic zero-count predicate.
   Any future validation/remediation requires a separate reviewed semantic decision
   and actual snapshot evidence; do not ignore constraints, drop/disable them,
   rewrite rows, alter the encrypted original or mutate production/original DBs.

Only this document was written. No runtime query, restore, archive inspection,
validation or remediation was performed, and no engine/test/source gate changed.

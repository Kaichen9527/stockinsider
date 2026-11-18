## Source receipt namespace

The raw-source write trigger and publication seal run under
`research_source_fence_owner_v2`. The Contabo predecessor denies that
role usage of the `public` schema. A source write can pass the writer
fence and still fail to record its receipt.

Migration `20261118_56_vnext_source_fence_private_schema_v1.sql` moves the
three existing receipt tables into `stockinsider_source_fence`. It keeps
their physical relation OIDs, data, foreign keys, triggers, and RLS.
Only the receipt owner receives usage of the private schema. Three
explicitly granted invoker functions bind existing raw-source objects and
still enforce the caller's existing object privileges. Public names of
the receipt tables resolve to invoker views for compatibility. Only the
existing input-preparation role retains its explicit seal-read grant.
The migration preserves the four routine signatures, owners, options,
and function ACLs.

Place this migration after the reviewed predecessor hardening in the
Contabo release change set. Use the existing reviewed database operator
path against the selected database with errors treated as fatal. The SQL
requires a local PostgreSQL operator and the expected function body and
receipt ACL profile. It takes a source-table SHARE lock before attempting
the existing receipt advisory lock, and applies bounded receipt-table
locks. Contention aborts the transaction. A second apply against the
already migrated schema fails the predecessor check.

The paired forward reversal is
`deployment/vps/rollback-vnext-source-fence-private-schema-v1.sql`. It
moves the same physical tables back, restores the four previous function
bodies, and removes migration-created objects with RESTRICT. Rows
committed after the migration are retained. This restores predecessor
behavior, including its source receipt permission error. Account for
that behavior when coordinating application rollback and source
operations. Any new dependency on a compatibility view aborts the
reversal without partial changes.

The isolated native test covers source writes through the existing
writer lease, sealing, withdrawal, table identity, contention, rollback
with populated receipt tables, and reapplication. A PostgreSQL custom dump
restored into a fresh database must retain the receipt rows, effective
ACLs and foreign keys. The restored copy must still report withdrawal,
support a write and seal through the existing writer, and survive the
reversal and reapplication. The staged HTTP test
uses two valid cached publication clocks and a separate unverified
original-event clock. Actual source and model acceptance, independent
review, and the required protected CI stay part of the release gate.

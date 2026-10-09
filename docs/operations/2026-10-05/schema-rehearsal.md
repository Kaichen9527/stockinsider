# Release schema rehearsal — October 5

Read-only Contabo exports contain schema definitions only, no production rows.
Original owner-preserving schema SHA256 is
`8f7b7404958c53e7e8fa7b632e05341a874afd4e97dfa1552cd3d3a23f102e86`;
the separate ACL-preserving schema SHA256 is
`2cb8fb3dc3970ed4786f1238b50ca22ea1a067130d0e331c6ea3ddd991a2758f`.
Private snapshots stay outside Git; only sanitized metadata/receipts are saved.

Actual release readers/source helpers are owned by postgres, whereas replay
replaces them after switching to narrower owner roles. Four existing bodies
match tracked SQL byte for byte. The preserved V3.19 authoritative body has two
verified formatting variants; independent review established exact equivalence
using two explicitly counted replacements, preserving literals. A finite prelude
now validates complete profiles and transfers only these five functions inside
the existing reviewed transaction. It never recreates their bodies or grants
postgres membership. Unknown bodies, owners, roles or execution ACLs reject.

The first prerequisite-shaped rehearsal also caught a real pgcrypto schema
error: technical identity used public.digest but production installs the extension
in extensions. The SQL and actual PostgreSQL fixture now use extensions.digest.
The source-bound strategy manifest is regenerated; parameters are unchanged,
and previous exact-version approvals are neither modified nor carried forward.

Actual production `stockinsider_runtime_v319` is NOLOGIN/NOINHERIT with connection
limit -1. The original reviewed migration requires LOGIN/NOINHERIT, connection
limit 6 and no elevated capabilities. The new preflight surfaces this prerequisite
before any mutation; it does not enable the login, invent a password or configure
credentials. A trusted reviewed runtime bootstrap is still necessary. The
production managed-migrator role is absent; no least-privilege operator acceptance
is claimed from a local SET ROLE exercise.

Local positive chain rehearsals additionally simulate the required runtime-role
profile to isolate SQL integration from that observed production blocker. They
restore actual owner/ACL definitions into a disposable socket-only cluster,
use a local postgres superuser matching the current production capability profile,
retain the stronger existing dossier predecessor and apply the compound plan
atomically. Simulated role attributes, clean/dirty tree status and every actual
ordered migration hash must remain visible. This is not a production apply,
full privileged-role/membership reproduction or financial-row cutover test.

Earlier exploratory receipts with dirty source and incomplete role/ACL restoration
are diagnostic only; they are not frozen release evidence. Temporary clusters are
removed after every rehearsal. No production schema, role, secret, stock history,
research evidence or other application was changed.

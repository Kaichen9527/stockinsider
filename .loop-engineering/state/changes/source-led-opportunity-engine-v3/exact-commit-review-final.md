# Exact implementation review — Supabase-independent Contabo backup

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `19cd27d6245c70c9b355a3b449134aa3464f7490` / `4a7c12032f15c1435b070338b2459818f187818b`
- Full final range: `45f5da289df5fee81f17f6041deab126ca67f3b4..19cd27d6245c70c9b355a3b449134aa3464f7490`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Daily backup orchestration after the StockInsider data-plane cutover.
- PostgreSQL export from the fixed Contabo host over SSH and the local Unix socket.
- Hash-addressed private artifact inventory, streaming authentication, encryption, and restore rehearsal.
- Provider envelope decryption and immediate re-wrapping into the portable encrypted recovery format.
- Backward restore compatibility during the seven-day read-only Supabase observation period.

## Security and correctness reasoning

- The orchestrator no longer calls the retired Supabase database, Storage, or Vault exporters.
- Database authentication remains server-local. Private document and provider traffic use strict-host-key SSH and are encrypted before any local file is published.
- Every private document is bounded, streamed, checked against its SHA-256 filename, and compared against a stable before/after inventory. Unexpected depth, file type, symlink, size, or hash fails closed.
- Provider ciphertext is identity-bound AES-256-GCM. The systemd root credential and token plaintext remain in bounded process memory, are wrapped by the local backup key, and are cleared on all terminal paths; no secret enters argv, Git, a plaintext file, or receipt.
- Restore readers accept the new Contabo manifests while retaining the prior Supabase format only for rollback compatibility. A complete backup still requires document restore, provider verification, and clean PostgreSQL application validation.

## Verification

- `npm run test:contabo-capacity-backup` — 60 passed, 0 failed.
- Focused cutover, provider, storage, and database tests — 21 passed, 0 failed.
- Live private artifact export — 8 objects, 10,550,883 plaintext bytes, authenticated encrypted members produced.
- Live provider recovery export — 2 current Contabo credentials decrypted, re-wrapped, and independently verified without printing secrets.
- Live document restore rehearsal — 8 objects restored into a private hash-addressed scratch layout and re-hashed; plaintext scratch removed.
- `git diff --check 45f5da289df5fee81f17f6041deab126ca67f3b4..19cd27d6245c70c9b355a3b449134aa3464f7490` — passed.
- Protected product-runtime gate for the exact subject — passed.

The reviewed commit removes the last scheduled backup dependency on the retiring Supabase project without weakening recovery or evidence requirements.

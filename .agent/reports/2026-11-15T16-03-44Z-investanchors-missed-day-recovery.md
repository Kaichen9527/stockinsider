# T03 InvestAnchors closed-day recovery

The 08:15 worker now resumes the oldest incomplete closed Taipei mailbox day from the private writer ledger. A morning run can finish two days to catch up. It stops on failure or budget deferral and leaves the pending day durable. Worker activation remains disabled by default.

Disposable Contabo staging passed the PostgreSQL 17 upgrade and writer/ACL/quota/gap recovery checks. Node 22.14.0 passed 34 tests and the targeted Gmail transport TypeScript check. The full Next.js build, live Gmail grant and member-content acceptance remain open. See [evidence](../../openspec/changes/stockinsider-vnext-20/evidence/2026-11-15-t03-investanchors-missed-day-recovery.json).

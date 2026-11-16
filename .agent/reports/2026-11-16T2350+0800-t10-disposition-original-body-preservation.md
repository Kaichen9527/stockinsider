# Preserve original disposition reports for staging replay

The November 16 observer saved SHA-256 for the two disposition reports and discarded their bodies. The November 17 21:28 staging observer now retains the licensed, parsed responses for 29082 and 11396. It records the observation and durable write times separately. This evidence covers reported restrictions and leaves full-market trading status unresolved.

Five Python tests passed in isolated Contabo staging. A real late read regenerated the previous byte counts and hashes and did not retain either body. The existing staging timer and service definitions match their prior digest. The previous runner copy is preserved and the scheduled capture is still pending. [Machine-readable evidence](../../docs/operations/2026-11-16/vnext/t10-disposition-original-body-preservation.json)

The unchanged web source also passed the full `npm run build -- --webpack` on staging.

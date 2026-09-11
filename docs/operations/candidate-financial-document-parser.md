# Candidate financial document parser runbook

This parser is a private VPS worker dependency for verified issuer documents.
It is deliberately not enabled in Vercel and it never accepts a source URL,
taxonomy URL, or an input file path from an API request.  The application
passes already-uploaded bytes over stdin after it has verified the receipt's
SHA-256.

## Deployment prerequisites

Apply database migrations in this explicit order:

1. `migrations/20260906_truth_research_v3.sql`
2. `migrations/20260907_evidence_valuation_contract_v6.sql`
3. `migrations/20260907_02_candidate_financial_documents_v6.sql`
4. `migrations/20260907_03_candidate_financial_document_parser_v6.sql`

On the VPS, create a dedicated reviewed virtual environment outside the
repository.  The interpreter path is the only executable path the Node adapter
will accept.  Do not place this setting or any credential in a checked-in
`.env` file.

```sh
python3.11 -m venv /opt/stockinsider/runtime/candidate-financial-parser
/opt/stockinsider/runtime/candidate-financial-parser/bin/pip install --upgrade pip
/opt/stockinsider/runtime/candidate-financial-parser/bin/pip install --requirement \
  /srv/stockinsider/scripts/requirements-candidate-financial-document-parser.txt
/opt/stockinsider/runtime/candidate-financial-parser/bin/python -c \
  'from arelle import Cntlr; import pdfplumber; print("candidate-parser-ready")'
```

Install and enable `stockinsider-financial-parser.socket`. The application
talks only to `/run/stockinsider/candidate-financial-parser.sock`; it cannot
spawn the parser under the web identity. The socket-activated service uses a
DynamicUser, has no EnvironmentFile or credentials, has no network namespace,
and receives only hash-bound bytes over the Unix socket.

For the existing credential-scrubbing socket launcher, Arelle also supports the
root-owned `config/XDG_CONFIG_HOME` pointer in its installed package. Install
`deployment/vps/arelle-config-root` there only when `PrivateTmp=true` and
`UMask=0077` are enabled. Its target is inside the service's private temporary
namespace, not the web release or an account home. This restores operation for a
DynamicUser with no writable home without changing the reviewed parser code or
granting access to secrets. The newer launcher uses a per-request temporary XDG
directory instead and takes precedence over this pointer. Never disable sandbox
protection to work around `PermissionError: /.config`.

Record the interpreter package hashes, OS package inventory, and reviewer in
the deployment evidence.  The isolated service starts its parser without a
shell, with a scrubbed environment, a 25-second wall timeout, and bounded stdout/stderr.
The Python process also applies CPU, address-space, file-size, page-count, and
input-size limits.  A missing runtime marks a receipt `partial`; it must never
fall through to an unvalidated regex extraction.

## Parsers and evidence boundary

`arelle-release==2.44.7` validates XBRL/iXBRL structure locally, with its web
cache offline.  Pre-approve and provision any required Taiwan taxonomy files
inside the reviewed runtime before enabling a filing family.  An unresolved
taxonomy produces a hash-bound, locator-only partial receipt rather than a
network request or asserted financial fact.

`pdfplumber==0.11.8` extracts bounded text/table page coordinates from text
PDFs.  PDF output is always `partial`: a reviewer or a separately validated
manifest must bind an accounting value, its page/table location, unit, and
period to the original SHA-256 before it can be written as a fact.

Docling is not installed in the normal VPS parser environment.  It is an
explicit, one-shot, offline fallback for a failed ordinary PDF parse only.
Before any isolated installation, a security owner must record the exact
reviewed Docling version, its dependency lock, and disposition for every
current 2026 Docling advisory. A new advisory, unreviewed model artefact, or
unreviewed version keeps the fallback disabled; it is never a reason to relax
ordinary PDF validation. A separately reviewed environment may then set:

```text
STOCKINSIDER_DOCUMENT_PARSER_ALLOW_DOCLING=true
STOCKINSIDER_DOCUMENT_PARSER_DOCLING_MODELS=/opt/stockinsider/models/docling-reviewed
```

The model directory must be absolute, locally provisioned, licence-reviewed,
and readable by the isolated worker.  The adapter forces Hugging Face and
Transformers offline.  Never use Docling to download a model, fetch a URL, or
turn a scanned document directly into accounting facts.

## Verification and incident handling

Run the small XBRL fixture against the installed interpreter before enabling
the worker:

```sh
cd /srv/stockinsider/web
STOCKINSIDER_DOCUMENT_PARSER_PYTHON=/opt/stockinsider/runtime/candidate-financial-parser/bin/python \
STOCKINSIDER_DOCUMENT_PARSER_SCRIPT=/srv/stockinsider/scripts/candidate_financial_document_parser.py \
  npx tsx --test src/lib/candidate-financial-local-parser.test.ts
```

The fixture must return its exact input hash and an `instant-2026q2` XBRL
context locator.  A missing local taxonomy can legitimately make it partial;
the locator demonstrates that facts cannot be detached from their reporting
context.  Test a representative text PDF separately and verify its returned
page/table locators against the original document hash.

If a parser times out, returns malformed JSON, exceeds output bounds, or is
not configured, keep the document receipt partial and retain the underlying
acquisition job.  Investigate the controlled runtime or submit an approved
issuer document; do not retry through public URLs, relax the timeout, or mark
the queue as progressed merely because the same mirror data was seen again.

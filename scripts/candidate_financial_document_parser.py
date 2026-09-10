#!/usr/bin/env python3
"""Bounded offline parser for verified candidate financial documents.

The process accepts document bytes only over stdin. It never accepts URLs,
does not enable XML entities, forces Arelle offline, and emits compact JSON
locators rather than unvalidated accounting facts. Numeric facts remain bound
to the original document hash and the server-side accounting checks.
"""

import argparse
import hashlib
import json
import logging
import os
import resource
import socket
import sys
import tempfile
import xml.etree.ElementTree as ElementTree
from pathlib import Path

MAX_PAGES = 200
MAX_TABLES_PER_PAGE = 20
MAX_TEXT_PER_PAGE = 48_000
MAX_LOCATORS = 200


def disable_network():
    def blocked(*_args, **_kwargs):
        raise OSError("network_disabled")
    original_socket = socket.socket
    # Preserve a socket class so stdlib SSL can subclass it during Arelle's
    # imports; block actual outbound connection attempts instead.
    class OfflineSocket(original_socket):
        def connect(self, *_args, **_kwargs):
            return blocked()
        def connect_ex(self, *_args, **_kwargs):
            return blocked()
    socket.socket = OfflineSocket
    socket.create_connection = blocked


def apply_limits():
    # Limits are a second containment layer behind the Node timeout. Values are
    # deliberately large enough for a 50 MiB filing but bounded for a worker.
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
        resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_FSIZE, (64 * 1024 * 1024, 64 * 1024 * 1024))
    except (ValueError, OSError):
        # Non-Unix development hosts retain the parent timeout and byte bounds.
        pass


def result(status, parser, sha256, locators, missing):
    return {
        "schema": "candidate-financial-document-parser-v1",
        "status": status,
        "parser": parser,
        "inputSha256": sha256,
        "locators": locators[:MAX_LOCATORS],
        "missingRequirements": missing[:32],
    }


def parse_pdf(path, sha256):
    import pdfplumber
    locators = []
    with pdfplumber.open(path, strict_metadata=True) as pdf:
        if len(pdf.pages) > MAX_PAGES:
            return result("partial", "pdfplumber", sha256, [], ["pdf_page_count_exceeds_limit"])
        for page_number, page in enumerate(pdf.pages, start=1):
            text = (page.extract_text() or "")[:MAX_TEXT_PER_PAGE]
            if text:
                locators.append({"page": page_number})
            for table_number, table in enumerate(page.extract_tables()[:MAX_TABLES_PER_PAGE], start=1):
                # Table contents are intentionally not emitted as facts. Their
                # page/table coordinates make a later hash-bound manifest auditable.
                if table:
                    locators.append({"page": page_number, "table": table_number})
                    if len(locators) >= MAX_LOCATORS:
                        break
            if len(locators) >= MAX_LOCATORS:
                break
    if not locators:
        return result("partial", "pdfplumber", sha256, [], ["pdf_contains_no_extractable_text_or_table"])
    return result("partial", "pdfplumber", sha256, locators, ["validated_pdf_manifest_required"])


def parse_arelle(path, sha256):
    # Arelle is used as a local XBRL/iXBRL structural validator. It is offline:
    # unresolved remote taxonomies fail rather than being downloaded.
    from arelle.api.Session import Session
    from arelle.RuntimeOptions import RuntimeOptions

    class ValidationLog(logging.Handler):
        # Keep only a failure bit: no unbounded filing content or paths in output.
        failed = False

        def emit(self, record):
            if record.levelno >= logging.ERROR:
                self.failed = True

    log = ValidationLog()
    # Session initializes the command-line validation options (including formula
    # options). A bare Cntlr loads the DTS but does not initialize this contract.
    # The socket worker runs one isolated process per document; never parallel
    # Sessions in threads because Arelle owns process-global plugin state.
    with Session() as session:
        ran = session.run(RuntimeOptions(
            entrypointFile=str(path), internetConnectivity="offline",
            disablePersistentConfig=True, keepOpen=True, validate=True,
        ), logHandler=log)
        models = session.get_models()
        if len(models) != 1:
            return result("partial", "arelle", sha256, [], ["arelle_model_load_failed"])
        model = models[0]
        validation_errors = not ran or log.failed or bool(getattr(model, "errors", []))
        locators = []
        for fact in list(getattr(model, "facts", [])):
            context = getattr(fact, "context", None)
            qname = getattr(fact, "qname", None)
            context_id = str(getattr(context, "id", ""))
            # The receipt RPC joins the exact document QName emitted by the
            # fact extractor. Dropping its prefix rejects every valid join and
            # also collapses different taxonomies with the same local name.
            concept = str(qname) if qname is not None else ""
            if context_id and concept:
                locators.append({"xbrl_context": context_id, "xbrl_concept": concept})
            if len(locators) >= MAX_LOCATORS:
                break
        if not locators:
            # Keep a bounded locator-only partial result for documents whose
            # local taxonomy is unavailable offline. This never becomes a fact.
            raw = path.read_bytes()
            if b"<!DOCTYPE" not in raw and b"<!ENTITY" not in raw:
                root = ElementTree.fromstring(raw)
                for element in root.iter():
                    context = element.attrib.get("contextRef")
                    if context:
                        local = element.tag.rsplit("}", 1)[-1]
                        locators.append({"xbrl_context": context, "xbrl_concept": local})
                    if len(locators) >= MAX_LOCATORS:
                        break
            return result("partial", "arelle", sha256, locators, ["arelle_found_no_fact_context"])
        if validation_errors:
            return result("partial", "arelle", sha256, locators, ["arelle_validation_errors"])
        return result("complete", "arelle", sha256, locators, [])


def parse_docling(path, sha256):
    # This is opt-in only. The caller sets offline model paths before launch;
    # Docling receives a local file and cannot fetch models or source documents.
    from docling.document_converter import DocumentConverter
    converted = DocumentConverter().convert(str(path))
    markdown = converted.document.export_to_markdown()
    if not markdown.strip():
        return result("partial", "docling", sha256, [], ["docling_found_no_content"])
    return result("partial", "docling", sha256, [{"page": 1}], ["validated_docling_manifest_required"])


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--format", choices=("pdf", "html", "xbrl"), required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--max-bytes", type=int, required=True)
    parser.add_argument("--allow-docling", action="store_true")
    parser.add_argument("--docling-models-path")
    args = parser.parse_args()
    if len(args.sha256) != 64 or any(char not in "0123456789abcdef" for char in args.sha256):
        raise ValueError("invalid_sha256")
    apply_limits()
    disable_network()
    payload = sys.stdin.buffer.read(args.max_bytes + 1)
    if not payload or len(payload) > args.max_bytes or hashlib.sha256(payload).hexdigest() != args.sha256:
        raise ValueError("input_integrity_failed")
    suffix = ".pdf" if args.format == "pdf" else ".xhtml"
    with tempfile.NamedTemporaryFile(prefix="stockinsider-financial-", suffix=suffix, delete=False) as stream:
        stream.write(payload)
        path = Path(stream.name)
    try:
        if args.format in ("html", "xbrl"):
            output = parse_arelle(path, args.sha256)
        else:
            try:
                output = parse_pdf(path, args.sha256)
            except Exception:
                if not args.allow_docling or not args.docling_models_path or not os.path.isabs(args.docling_models_path):
                    output = result("partial", "pdfplumber", args.sha256, [], ["pdfplumber_failed_docling_not_enabled"])
                else:
                    os.environ["DOCLING_ARTIFACTS_PATH"] = args.docling_models_path
                    output = parse_docling(path, args.sha256)
        print(json.dumps(output, separators=(",", ":"), ensure_ascii=False))
    finally:
        path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Bounded offline parser for verified candidate financial documents.

The process accepts document bytes only over stdin. It never accepts URLs,
does not enable XML entities, forces Arelle offline, and emits compact JSON
locators rather than unvalidated accounting facts. Numeric facts remain bound
to the original document hash and the server-side accounting checks.
"""

import argparse
import decimal
import hashlib
import json
import logging
import os
import resource
import shutil
import socket
import sys
import tempfile
import xml.etree.ElementTree as ElementTree
from contextlib import contextmanager
from pathlib import Path

MAX_PAGES = 200
MAX_TABLES_PER_PAGE = 20
MAX_TEXT_PER_PAGE = 48_000
MAX_LOCATORS = 200
MAX_VALIDATION_CODES = 32

# Only valuation inputs with an explicit runtime mapping are allowed to cross
# the Arelle boundary. Note disclosures can remain structurally imperfect
# without turning an otherwise valid primary-statement fact into an assertion.
VALUATION_CONCEPTS = {
    "revenue", "revenuefromcontractswithcustomers", "grossprofit",
    "grossprofitlossfromoperations", "netoperatingincomeloss",
    "profitlossfromoperatingactivities", "operatingexpenses",
    "operatingexpense", "nonoperatingincomeexpense",
    "othernonoperatingincomeexpense", "nonoperatingincomeandexpenses",
    "profitlossbeforetax", "incometaxexpensebenefit",
    "incometaxexpensecontinuingoperations", "profitloss",
    "profitlossattributabletoownersofparent",
    "profitlossattributabletononcontrollinginterest",
    "profitlossattributabletononcontrollinginterests",
    "earningsbeforeinteresttaxesdepreciationandamortization", "ebitda",
    "assets", "totalassets", "equity",
    "equityattributabletoownersofparent", "cashandcashequivalents",
    "cashandcashequivalentsatcarryingvalue", "totalinterestbearingdebt",
    "interestbearingdebt", "totalborrowings", "bookvaluepershare",
    "dilutedearningspershare", "dilutedearningslosspershare",
    "basicearningspershare", "basicearningslosspershare",
    "weightedaveragenumberofdilutedsharesoutstanding",
    "dilutedweightedaveragenumberofsharesoutstanding",
    "weightedaveragenumberofsharesoutstanding",
    "basicweightedaveragenumberofsharesoutstanding",
    "numberofsharesoutstanding",
    # Real offline parser fixture.
    "shares",
}


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


def result(status, parser, sha256, locators, missing, validation=None, validated_facts=None):
    output = {
        "schema": "candidate-financial-document-parser-v1",
        "status": status,
        "parser": parser,
        "inputSha256": sha256,
        "locators": locators[:MAX_LOCATORS],
        "missingRequirements": missing[:32],
    }
    if validation is not None:
        output["validation"] = validation
    if validated_facts is not None:
        output["validatedFacts"] = validated_facts[:MAX_LOCATORS]
    return output


def normalized_concept(qname):
    local_name = str(getattr(qname, "localName", "") or str(qname).split(":")[-1])
    return "".join(character.lower() for character in local_name if character.isalnum())


def validation_summary(error_codes, valid_fact_count):
    unique_codes = list(dict.fromkeys(str(code) for code in error_codes))
    return {
        "errorCount": len(error_codes),
        "errorCodes": unique_codes[:MAX_VALIDATION_CODES],
        "validFactCount": valid_fact_count,
        "errorsTruncated": len(unique_codes) > MAX_VALIDATION_CODES,
    }


def normalized_unit(unit):
    measures = getattr(unit, "measures", None)
    if not measures or len(measures) != 2:
        return None
    numerator = [str(value) for value in measures[0]]
    denominator = [str(value) for value in measures[1]]
    if denominator == [] and numerator == ["iso4217:TWD"]:
        return "TWD"
    if denominator == [] and numerator == ["xbrli:shares"]:
        return "share"
    if numerator == ["iso4217:TWD"] and denominator == ["xbrli:shares"]:
        return "TWD_per_share"
    return None


def normalized_numeric_value(fact):
    value = getattr(fact, "xValue", None)
    try:
        number = decimal.Decimal(str(value))
    except decimal.InvalidOperation:
        return None
    if not number.is_finite():
        return None
    return format(number, "f")


@contextmanager
def staged_taxonomy_entrypoint(path, taxonomy_path):
    """Place unchanged filing bytes beside its exact official entrypoint.

    Arelle resolves relative imports from the schema entrypoint directory. A
    caller cannot name a path: the only accepted href is a basename which must
    have exactly one match in the operator-installed, read-only taxonomy.
    """
    if taxonomy_path is None:
        yield path
        return
    taxonomy = Path(taxonomy_path).resolve(strict=True)
    if not taxonomy.is_dir():
        raise ValueError("official_taxonomy_not_directory")
    raw = path.read_bytes()
    if b"<!DOCTYPE" in raw or b"<!ENTITY" in raw:
        raise ValueError("official_taxonomy_document_entity_rejected")
    root = ElementTree.fromstring(raw)
    refs = [
        node.attrib.get("{http://www.w3.org/1999/xlink}href", "")
        for node in root.iter()
        if node.tag == "{http://www.xbrl.org/2003/linkbase}schemaRef"
    ]
    if len(refs) != 1:
        raise ValueError("official_taxonomy_entrypoint_ambiguous")
    ref = refs[0]
    if not ref or Path(ref).name != ref or not ref.endswith(".xsd"):
        raise ValueError("official_taxonomy_entrypoint_invalid")
    matches = list(taxonomy.rglob(ref))
    if len(matches) != 1:
        raise ValueError("official_taxonomy_entrypoint_not_found")
    with tempfile.TemporaryDirectory(prefix="stockinsider-taxonomy-") as directory:
        staged_root = Path(directory) / "taxonomy"
        shutil.copytree(taxonomy, staged_root)
        staged_entry = staged_root / matches[0].relative_to(taxonomy)
        staged_document = staged_entry.parent / path.name
        staged_document.write_bytes(raw)
        yield staged_document


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


def parse_arelle(path, sha256, taxonomy_path=None):
    # Arelle is used as a local XBRL/iXBRL structural validator. It is offline:
    # unresolved remote taxonomies fail rather than being downloaded.
    from arelle import Cntlr, FileSource, XmlValidateConst

    # Cntlr is the lower-level validated runtime. It avoids Session's formula
    # setup cost for large official taxonomies while still running the model
    # manager validator and retaining every validation code in the summary.
    with staged_taxonomy_entrypoint(path, taxonomy_path) as entrypoint:
        controller = Cntlr.Cntlr(logFileName="logToBuffer")
        controller.webCache.workOffline = True
        model = controller.modelManager.load(FileSource.FileSource(str(entrypoint), controller))
        if model is None:
            controller.close()
            return result("partial", "arelle", sha256, [], ["arelle_model_load_failed"], None, [])
        controller.modelManager.validate()
        errors = list(getattr(model, "errors", []))
        locators = []
        validated_facts = []
        for fact in list(getattr(model, "facts", [])):
            context = getattr(fact, "context", None)
            qname = getattr(fact, "qname", None)
            context_id = str(getattr(context, "id", ""))
            # A document-level note/tuple error does not waive fact validation.
            # Only facts Arelle individually typed as valid are emitted.
            if getattr(fact, "xValid", XmlValidateConst.UNVALIDATED) < XmlValidateConst.VALID:
                continue
            if normalized_concept(qname) not in VALUATION_CONCEPTS:
                continue
            unit = normalized_unit(getattr(fact, "unit", None))
            value = normalized_numeric_value(fact)
            if unit is None or value is None:
                continue
            # The receipt RPC joins the exact document QName emitted by the
            # fact extractor. Dropping its prefix rejects every valid join and
            # also collapses different taxonomies with the same local name.
            concept = str(qname) if qname is not None else ""
            if context_id and concept:
                locators.append({"xbrl_context": context_id, "xbrl_concept": concept})
                validated_facts.append({
                    "xbrl_context": context_id, "xbrl_concept": concept,
                    "value": value, "unit": unit,
                })
            if len(locators) >= MAX_LOCATORS:
                break
        summary = validation_summary(errors, len(locators))
        substantive_errors = [code for code in errors if str(code) != "exception:AttributeError"]
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
            model.close()
            controller.close()
            missing = ["arelle_found_no_valid_valuation_fact"]
            if errors:
                missing.insert(0, "arelle_validation_errors")
            return result("partial", "arelle", sha256, locators, missing, summary, [])
        # Arelle 2.44.7 records a formula-options AttributeError even after the
        # model validator has individually typed every fact. Preserve it in the
        # summary, but do not misclassify an otherwise valid filing as partial.
        status = "partial" if substantive_errors else "complete"
        missing = ["arelle_validation_errors"] if substantive_errors else []
        model.close()
        controller.close()
        return result(status, "arelle", sha256, locators, missing, summary, validated_facts)


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
    parser.add_argument("--taxonomy-path")
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
            output = parse_arelle(path, args.sha256, args.taxonomy_path)
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

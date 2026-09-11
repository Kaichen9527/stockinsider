#!/usr/bin/env python3
"""Bounded offline parser for verified candidate financial documents.

The process accepts document bytes only over stdin. It never accepts URLs,
does not enable XML entities, forces Arelle offline, and emits compact JSON
locators rather than unvalidated accounting facts. Numeric facts remain bound
to the original document hash and the server-side accounting checks.
"""

import argparse
import datetime
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
from collections import defaultdict
from contextlib import contextmanager
from pathlib import Path

# The socket runtime stages this helper beside the pinned parser script.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from candidate_financial_fact_scope import (all_facts, canonical_bytes, digest,
    fact_admission_manifest, fact_occurrence_key, logical_fact_paths, qname_identity,
    register_conflicting_duplicates, validation_records)

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


def result(status, parser, sha256, locators, missing, validation=None, validated_facts=None,
           runtime_version=None, taxonomy_sha256=None):
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
    if runtime_version is not None:
        output["runtimeVersion"] = runtime_version
    if taxonomy_sha256 is not None:
        output["taxonomySha256"] = taxonomy_sha256
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
    # Prefixes are local aliases, not identities. Resolve namespace and local
    # name so a valid filing using a different currency/share prefix is usable.
    numerator = [(value.namespaceURI, value.localName) for value in measures[0]]
    denominator = [(value.namespaceURI, value.localName) for value in measures[1]]
    currency = ("http://www.xbrl.org/2003/iso4217", "TWD")
    shares = ("http://www.xbrl.org/2003/instance", "shares")
    if denominator == [] and numerator == [currency]:
        return "TWD"
    if denominator == [] and numerator == [shares]:
        return "share"
    if numerator == [currency] and denominator == [shares]:
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


def context_manifest(context):
    """Return the exact, non-dimensional issuer period Arelle validated.

    Arelle exposes end/instant datetimes as the exclusive following midnight
    for date-only XBRL periods, so normalize them back to the reported date.
    """
    if context is None or len(getattr(context, "qnameDims", {}) or {}) != 0:
        return None
    if any(str(getattr(node, "tag", "")) in (
            "{http://www.xbrl.org/2003/instance}segment", "{http://www.xbrl.org/2003/instance}scenario")
           for node in context.iterdescendants()):
        return None
    # Arelle advances DATE-only ends by a day, but does not do so for dateTime.
    # Reject timestamp periods rather than silently shifting them to yesterday
    # and manufacturing a match for the requested official quarter-end.
    period_tags = {"{http://www.xbrl.org/2003/instance}" + name for name in ("instant", "startDate", "endDate")}
    for node in context.iterdescendants():
        if str(getattr(node, "tag", "")) in period_tags:
            value = str(node.text or "").strip()
            try:
                if len(value) != 10 or datetime.date.fromisoformat(value).isoformat() != value:
                    return None
            except ValueError:
                return None
    entity = getattr(context, "entityIdentifier", None)
    if not entity or len(entity) != 2:
        return None
    identifier = str(entity[1] or "")
    if not identifier.isdigit() or not 4 <= len(identifier) <= 6:
        return None
    one_day = datetime.timedelta(days=1)
    if getattr(context, "isInstantPeriod", False):
        instant = getattr(context, "instantDatetime", None)
        if instant is None:
            return None
        return {
            "entity_identifier": identifier,
            "period_start": None,
            "period_end": (instant - one_day).date().isoformat(),
            "duration_kind": "instant",
            "dimension_count": 0,
        }
    if getattr(context, "isStartEndPeriod", False):
        start = getattr(context, "startDatetime", None)
        end = getattr(context, "endDatetime", None)
        if start is None or end is None:
            return None
        return {
            "entity_identifier": identifier,
            "period_start": start.date().isoformat(),
            "period_end": (end - one_day).date().isoformat(),
            "duration_kind": "quarterly",
            "dimension_count": 0,
        }
    return None


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


def parse_arelle(path, sha256, taxonomy_path=None, taxonomy_sha256=None,
                 expected_entity=None, expected_period_end=None):
    # Arelle is used as a local XBRL/iXBRL structural validator. It is offline:
    # unresolved remote taxonomies fail rather than being downloaded.
    from arelle import Cntlr, FileSource, Version, XmlValidateConst, ValidateXbrlDimensions
    from arelle.ModelDocument import Type
    from arelle.ModelFormulaObject import FormulaOptions
    from arelle.ValidateXbrlCalcs import ValidateCalcsMode
    runtime_version = str(Version.version)
    if taxonomy_path is not None and (not taxonomy_sha256 or len(taxonomy_sha256) != 64):
        raise ValueError("official_taxonomy_identity_missing")
    def arelle_result(status, locators, missing, validation=None, validated_facts=None):
        return result(status, "arelle", sha256, locators, missing, validation, validated_facts,
                      runtime_version, taxonomy_sha256)

    # Cntlr is the lower-level validated runtime. It avoids Session's formula
    # setup cost for large official taxonomies while still running the model
    # manager validator and retaining every validation code in the summary.
    with staged_taxonomy_entrypoint(path, taxonomy_path) as entrypoint:
        controller = Cntlr.Cntlr(logFileName="logToBuffer")
        controller.webCache.workOffline = True
        controller.modelManager.formulaOptions = FormulaOptions()
        controller.modelManager.validateCalcs = ValidateCalcsMode.XBRL_v2_1
        model = controller.modelManager.load(FileSource.FileSource(str(entrypoint), controller))
        if model is None:
            controller.close()
            return arelle_result("partial", [], ["arelle_model_load_failed"], None, [])
        controller.modelManager.validate()
        register_conflicting_duplicates(model)
        source_records = validation_records(controller)
        candidates, source_keys = [], {}
        for fact in all_facts(model):
            context = getattr(fact, "context", None)
            qname = getattr(fact, "qname", None)
            context_id = str(getattr(context, "id", ""))
            # A document-level note/tuple error does not waive fact validation.
            # Only facts Arelle individually typed as valid are emitted.
            if (getattr(fact, "xValid", XmlValidateConst.UNVALIDATED) != XmlValidateConst.VALID
                    or not getattr(fact, "isNumeric", False) or getattr(fact, "isNil", True)):
                continue
            if normalized_concept(qname) not in VALUATION_CONCEPTS:
                continue
            unit = normalized_unit(getattr(fact, "unit", None))
            value = normalized_numeric_value(fact)
            context_details = context_manifest(context)
            if unit is None or value is None or context_details is None:
                continue
            if expected_entity is not None and context_details["entity_identifier"] != expected_entity:
                continue
            if expected_period_end is not None and context_details["period_end"] != expected_period_end:
                continue
            # The receipt RPC joins the exact document QName emitted by the
            # fact extractor. Dropping its prefix rejects every valid join and
            # also collapses different taxonomies with the same local name.
            concept = str(qname) if qname is not None else ""
            if (context_id and concept and getattr(fact, "concept", None) is not None
                    and fact.concept.qname == qname and qname.namespaceURI):
                key = fact_occurrence_key(fact, sha256)
                source_keys[fact.objectIndex] = key
                candidates.append((fact, {
                    "xbrl_context": context_id, "xbrl_concept": concept,
                    "value": value, "unit": unit, **context_details,
                    "factKey": key, "xValid": "VALID", "structuralStatus": "structurally_validated",
                    "sourceFactId": f"source:{fact.objectIndex}", "extractedFactId": f"source:{fact.objectIndex}",
                    "concept_namespace": str(qname.namespaceURI),
                }))
            if len(candidates) >= MAX_LOCATORS:
                break
        extracted = None
        extracted_sha256 = None
        extracted_records = []
        extracted_keys, matched = {}, {}
        inline = model.modelDocument.type in (Type.INLINEXBRL, Type.INLINEXBRLDOCUMENTSET)
        if inline:
            # Extract ALL facts, including invalid tuples, without repairing,
            # deduplicating or skipping anything. Reload the serialized output
            # into the same hash-bound offline DTS and validate it separately.
            from arelle.plugin.inlineXbrlDocumentSet import createTargetInstance
            target_path = entrypoint.parent / (entrypoint.stem + "-validated-extraction.xbrl")
            before_extraction = len(controller.logHandler.logRecordBuffer)
            exact_schema_refs = {node.attrib["{http://www.w3.org/1999/xlink}href"]
                                 for node in ElementTree.fromstring(path.read_bytes()).iter()
                                 if node.tag == "{http://www.xbrl.org/2003/linkbase}schemaRef"}
            if len(exact_schema_refs) != 1:
                raise ValueError("arelle_extracted_taxonomy_identity_ambiguous")
            target = createTargetInstance(model, str(target_path), exact_schema_refs,
                                          set(), skipInvalid=False)
            target.saveInstance(overrideFilepath=str(target_path))
            extraction_records = validation_records(controller, before_extraction)
            target.close()
            extracted_sha256 = hashlib.sha256(target_path.read_bytes()).hexdigest()
            before_reload = len(controller.logHandler.logRecordBuffer)
            extracted = controller.modelManager.load(FileSource.FileSource(str(target_path), controller))
            if extracted is None:
                raise ValueError("arelle_extracted_instance_load_failed")
            controller.modelManager.validate()
            register_conflicting_duplicates(extracted)
            extracted_records = validation_records(controller, before_reload)
            target_path.unlink(missing_ok=True)
            # A create/save failure cannot be hidden by a later clean reload.
            # Its builder object IDs have different identity, so fail closed.
            if extraction_records:
                raise ValueError("arelle_extraction_validation_errors")
            source_paths, extracted_paths = logical_fact_paths(model), logical_fact_paths(extracted)
            def signature(fact, paths):
                if fact.objectIndex not in paths:
                    raise ValueError("arelle_extracted_fact_logical_identity_missing")
                return (qname_identity(getattr(fact, "qname", None)), str(getattr(fact, "contextID", "")),
                        normalized_unit(getattr(fact, "unit", None)), normalized_numeric_value(fact),
                        str(fact.get("decimals")), str(fact.get("precision")),
                        str(getattr(fact, "id", None) or ""), paths[fact.objectIndex])
            by_signature = defaultdict(list)
            for fact in all_facts(extracted):
                by_signature[signature(fact, extracted_paths)].append(fact)
            for source, row in candidates:
                matches = by_signature.get(signature(source, source_paths), [])
                if len(matches) != 1:
                    raise ValueError("arelle_extracted_fact_identity_ambiguous")
                fact = matches[0]
                if (getattr(fact, "xValid", None) != XmlValidateConst.VALID
                        or context_manifest(fact.context) != context_manifest(source.context)):
                    # This candidate is not admitted, but remains in the scope
                    # map so its validation references stay in the manifest.
                    matched[source.objectIndex] = (fact, False)
                else:
                    matched[source.objectIndex] = (fact, True)
                extracted_keys[fact.objectIndex] = row["factKey"]
                row["extractedFactId"] = f"extracted:{fact.objectIndex}"
        manifest = fact_admission_manifest(sha256, taxonomy_sha256, extracted_sha256,
            model, source_records, source_keys, extracted, extracted_records, extracted_keys)
        rejected = {row["factKey"] for row in manifest["rejections"]}
        validated_facts = []
        for source, row in candidates:
            safe = (not manifest["documentFatal"] and row["factKey"] not in rejected
                    and ValidateXbrlDimensions.isFactDimensionallyValid(model, source))
            if inline:
                other, typed = matched[source.objectIndex]
                safe = safe and typed and ValidateXbrlDimensions.isFactDimensionallyValid(extracted, other)
            if safe:
                validated_facts.append(row)
        errors = [error["code"] for error in manifest["errors"]]
        # Absence of an operator-pinned taxonomy identity never authorizes
        # partial financial ingestion (legacy clean diagnostic fixtures remain).
        if errors and not taxonomy_sha256:
            validated_facts = []
        locators = [{"xbrl_context": row["xbrl_context"], "xbrl_concept": row["xbrl_concept"]}
                    for _, row in candidates]
        summary = validation_summary(errors, len(validated_facts))
        if taxonomy_sha256:
            # Only the human-readable code summary is capped. The v2 manifest
            # contains every error record; overflow raises before this point.
            summary["errorsTruncated"] = False
        if not candidates:
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
            missing = ["arelle_found_no_valid_valuation_fact"]
            if errors:
                missing.insert(0, "arelle_validation_errors")
        else:
            missing = ["arelle_validation_errors"] if errors else []
        status = "partial" if errors or not validated_facts else "complete"
        if manifest["documentFatal"]:
            missing.append("arelle_unscoped_or_fatal_validation_error")
        output = arelle_result(status, locators, missing, summary, validated_facts)
        if taxonomy_sha256:
            output["schema"] = "candidate-financial-document-parser-v2"
            output["factAcceptance"] = manifest
            output["errorManifestSha256"] = digest(manifest)
        if len(canonical_bytes(output)) > 2 * 1024 * 1024:
            raise ValueError("arelle_fact_scope_manifest_limit")
        if extracted is not None:
            extracted.close()
        model.close()
        controller.close()
        return output


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
    parser.add_argument("--taxonomy-sha256")
    parser.add_argument("--expected-entity")
    parser.add_argument("--expected-period-end")
    args = parser.parse_args()
    if len(args.sha256) != 64 or any(char not in "0123456789abcdef" for char in args.sha256):
        raise ValueError("invalid_sha256")
    if args.expected_entity is not None or args.expected_period_end is not None:
        if (not args.expected_entity or not args.expected_entity.isascii()
                or not args.expected_entity.isdigit() or not 4 <= len(args.expected_entity) <= 6
                or not args.expected_period_end
                or datetime.date.fromisoformat(args.expected_period_end).isoformat() != args.expected_period_end):
            raise ValueError("invalid_expected_context")
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
            output = parse_arelle(path, args.sha256, args.taxonomy_path, args.taxonomy_sha256,
                                 args.expected_entity, args.expected_period_end)
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

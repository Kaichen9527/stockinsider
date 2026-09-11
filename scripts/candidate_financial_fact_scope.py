"""Conservative, error-reference-scoped Arelle fact admission.

This does not repair filings, discard errors, or certify a partial document.
Unresolvable validation references are document-fatal. Rejection propagates
through tuple descendants, context/unit/concept users and calculation graphs.
"""
import hashlib
import json
import logging
from decimal import Decimal, InvalidOperation
from pathlib import Path
from collections import defaultdict, deque

MAX_ERROR_RECORDS = 16_384
MAX_MANIFEST_BYTES = 1_850_000
MAX_MODEL_NODES = 200_000
SCOPED_ERROR_CODES = frozenset({
    "lxml.SCHEMAV_ELEMENT_CONTENT", "xmlSchema:elementOccurrencesError", "xmlSchema:valueError",
    "ix11.15.1.2:tupleMemberOrderMissing", "ix11.11.1.2:tupleMemberOrderMissing",
    "ix11.10.1.2:tupleMemberOrderMissing", "ix:tupleContent",
    "xbrldie:PrimaryItemDimensionallyInvalidError", "xbrl.5.2.5.2:calcInconsistency",
    "stockinsider:conflictingFactDuplicates",
})


def canonical_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(value):
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def qname_identity(value):
    return "{" + str(getattr(value, "namespaceURI", "")) + "}" + str(getattr(value, "localName", ""))


def object_index(value):
    index = getattr(value, "objectIndex", None)
    return index if isinstance(index, int) else None


def all_facts(model):
    return sorted(getattr(model, "factsInInstance", set()), key=lambda item: item.objectIndex)


def fact_occurrence_key(fact, document_sha256):
    return digest({"document": document_sha256, "objectIndex": fact.objectIndex,
                   "concept": qname_identity(fact.qname), "context": fact.contextID,
                   "unit": getattr(fact, "unitID", None), "value": str(getattr(fact, "xValue", ""))})


def validation_records(controller, offset=0):
    # Arelle's calculation inconsistencies use level 33, below ERROR (40).
    return [record for record in controller.logHandler.logRecordBuffer[offset:]
            if record.levelno >= logging.WARNING + 3]


def register_conflicting_duplicates(model):
    groups = defaultdict(list)
    for fact in all_facts(model):
        context, unit = getattr(fact, "context", None), getattr(fact, "unit", None)
        if not getattr(fact, "isNumeric", False) or context is None or unit is None:
            continue
        groups[(qname_identity(fact.qname), context.contextDimAwareHash, unit.hash)].append(fact)
    for facts in groups.values():
        if len(facts) < 2:
            continue
        values = set()
        for fact in facts:
            try:
                value = Decimal(str(getattr(fact, "xValue", None)))
                values.add(value if value.is_finite() and not fact.isNil and fact.xValid == 4 else None)
            except InvalidOperation:
                values.add(None)
        if len(values) != 1 or None in values:
            model.error("stockinsider:conflictingFactDuplicates",
                        "Conflicting or invalid duplicate financial fact occurrences.", modelObject=facts)


def _related_fact_indexes(model):
    """Node -> directly dependent facts, and same-context calculation graph."""
    from arelle import XbrlConst
    facts = all_facts(model)
    dependencies = defaultdict(set)
    by_concept_context = defaultdict(lambda: defaultdict(set))
    for fact in facts:
        idx = fact.objectIndex
        dependencies[idx].add(idx)
        for child in fact.iterdescendants():
            if object_index(child) is not None:
                dependencies[child.objectIndex].add(idx)
        for node in (getattr(fact, "context", None), getattr(fact, "unit", None),
                     getattr(fact, "concept", None)):
            node_idx = object_index(node)
            if node_idx is not None:
                dependencies[node_idx].add(idx)
                for child in getattr(node, "iterdescendants", lambda: [])():
                    if object_index(child) is not None:
                        dependencies[child.objectIndex].add(idx)
        # Include the logical tuple tree, not just XHTML DOM ancestry. Inline
        # tuples can reference children located elsewhere in the document.
        parent = getattr(fact, "getparent", lambda: None)()
        while parent is not None:
            if object_index(parent) is not None:
                dependencies[parent.objectIndex].add(idx)
            parent = getattr(parent, "getparent", lambda: None)()
        continuation = getattr(fact, "_continuationElement", None)
        seen_continuations = set()
        while continuation is not None:
            c_idx = object_index(continuation)
            if c_idx is None or c_idx in seen_continuations:
                raise ValueError("arelle_fact_scope_continuation_ambiguous")
            seen_continuations.add(c_idx)
            dependencies[c_idx].add(idx)
            for child in continuation.iterdescendants():
                if object_index(child) is not None:
                    dependencies[child.objectIndex].add(idx)
            continuation = getattr(continuation, "_continuationElement", None)
        if getattr(fact, "context", None) is not None:
            by_concept_context[qname_identity(fact.qname)][(fact.context.contextDimAwareHash,
                                getattr(getattr(fact, "unit", None), "hash", None))].add(idx)
    for node in getattr(model, "modelObjects", []):
        if not getattr(node, "isTuple", False):
            continue
        pending = list(getattr(node, "modelTupleFacts", []))
        visited = set()
        while pending:
            child = pending.pop()
            idx = object_index(child)
            if idx is None or idx in visited:
                continue
            visited.add(idx)
            dependencies[node.objectIndex].add(idx)
            pending.extend(getattr(child, "modelTupleFacts", []))
    graph = defaultdict(set)
    for arcrole in XbrlConst.summationItems:
        for relation in model.relationshipSet(arcrole).modelRelationships:
            left = getattr(relation, "fromModelObject", None)
            right = getattr(relation, "toModelObject", None)
            if left is None or right is None:
                continue
            left_qname, right_qname = qname_identity(left.qname), qname_identity(right.qname)
            for (context, unit), left_facts in by_concept_context.get(left_qname, {}).items():
                right_facts = by_concept_context.get(right_qname, {}).get((context, unit), set())
                for l_idx in left_facts:
                    graph[l_idx].update(right_facts)
                for r_idx in right_facts:
                    graph[r_idx].update(left_facts)
    return dependencies, graph


def _error_is_fatal(code):
    return code not in SCOPED_ERROR_CODES


def scope_errors(model, records, phase, candidate_keys):
    """Return complete diagnostic records and fact-key -> error indexes.

    `candidate_keys` maps this model's exact occurrence indices to source-bound
    fact keys; only the output list is filtered. All model facts participate in
    dependency closure, including non-target-period and non-valuation facts.
    """
    if len(getattr(model, "modelObjects", [])) > MAX_MODEL_NODES or len(records) > MAX_ERROR_RECORDS:
        raise ValueError("arelle_fact_scope_manifest_limit")
    dependencies, graph = _related_fact_indexes(model)
    output, rejected = [], defaultdict(list)
    for record in records:
        code = str(getattr(record, "messageCode", "unclassified_validation_error"))
        refs = getattr(record, "refs", None) or []
        fatal = _error_is_fatal(code) or not refs or bool(record.exc_info)
        nodes, safe_refs = [], []
        for ref in refs:
            href = str(ref.get("href", ""))
            filename, separator, fragment = href.partition("#")
            # Random private staging filenames are not document identity.
            # Canonical document refs make exact-byte replays reproducible.
            if not filename or Path(filename).name == model.modelDocument.basename:
                href = ("source-document" if phase == "source" else "extracted-instance") + (separator + fragment)
            cleaned = {"href": href}
            if ref.get("objectId") is not None:
                cleaned["objectId"] = str(ref["objectId"])
            if ref.get("sourceLine") is not None:
                try:
                    cleaned["sourceLine"] = int(ref["sourceLine"])
                except (ValueError, TypeError):
                    fatal = True
            node = None
            if cleaned.get("objectId"):
                try:
                    node = model.modelObject(cleaned["objectId"])
                except (ValueError, IndexError, AttributeError):
                    node = None
            # lxml emits structured XPath arguments instead of modelObject.
            # Resolve only its unique node in the unchanged original tree;
            # never infer scope from human-readable diagnostic messages.
            exact_source_ref = filename in {model.modelDocument.basename, str(model.modelDocument.uri),
                                           str(model.modelDocument.filepath)}
            if (node is None and exact_source_ref and code == "lxml.SCHEMAV_ELEMENT_CONTENT"
                    and isinstance(record.args, dict)):
                xpath = record.args.get("xpath")
                if isinstance(xpath, str) and len(xpath) <= 4096:
                    tree = model.modelDocument.xmlRootElement.getroottree()
                    try:
                        resolved = tree.xpath(xpath, namespaces={k: v for k, v in tree.getroot().nsmap.items() if k})
                    except Exception:
                        resolved = []
                    if len(resolved) == 1 and object_index(resolved[0]) is not None:
                        node = resolved[0]
                        cleaned["objectId"] = str(node.objectId())
                        cleaned["sourceLine"] = int(node.sourceline or 0)
                        cleaned["xpath"] = xpath
            safe_refs.append(cleaned)
            # Never infer the scope of a generic file/root diagnostic from its
            # message text. An actual model-object reference is mandatory.
            if node is None:
                fatal = True
            else:
                # A scoped fact policy cannot certify a damaged DTS. Schema,
                # calculationArc and definitionArc errors can invalidate the
                # dependency graph itself, even with a precise node reference.
                if getattr(node, "modelDocument", None) is not model.modelDocument:
                    fatal = True
                nodes.append(node)
        impacted = set()
        for node in nodes:
            idx = object_index(node)
            if idx is None:
                fatal = True
                continue
            impacted.update(dependencies.get(idx, set()))
            for related in (getattr(node, "fromModelObject", None), getattr(node, "toModelObject", None)):
                related_idx = object_index(related)
                if related_idx is not None:
                    impacted.update(dependencies.get(related_idx, set()))
        pending = deque(impacted)
        while pending:
            idx = pending.popleft()
            for adjacent in graph.get(idx, set()):
                if adjacent not in impacted:
                    impacted.add(adjacent)
                    pending.append(adjacent)
        error_index = len(output)
        output.append({"phase": phase, "code": code, "refs": safe_refs, "fatal": fatal})
        if fatal:
            impacted.update(candidate_keys)
        for idx in impacted:
            key = candidate_keys.get(idx)
            if key:
                rejected[key].append(error_index)
    return output, rejected


def fact_admission_manifest(document_sha256, taxonomy_sha256, extracted_sha256,
                            source_model, source_records, source_keys,
                            extracted_model=None, extracted_records=None, extracted_keys=None):
    errors, rejected = scope_errors(source_model, source_records, "source", source_keys)
    if extracted_model is not None:
        second_errors, second_rejected = scope_errors(extracted_model, extracted_records or [], "extracted", extracted_keys or {})
        offset = len(errors)
        errors.extend(second_errors)
        for key, indexes in second_rejected.items():
            rejected[key].extend(offset + index for index in indexes)
    manifest = {
        "policyVersion": "arelle-fact-scope-v1", "documentSha256": document_sha256,
        "taxonomySha256": taxonomy_sha256, "extractedInstanceSha256": extracted_sha256,
        "sourceValidationCompleted": True, "extractedValidationCompleted": extracted_model is not None,
        "manifestComplete": True, "documentFatal": any(error["fatal"] for error in errors),
        "errors": errors,
        "rejections": [{"factKey": key, "errorIndexes": sorted(set(indexes))} for key, indexes in sorted(rejected.items())],
    }
    if len(errors) > MAX_ERROR_RECORDS or len(canonical_bytes(manifest)) > MAX_MANIFEST_BYTES:
        raise ValueError("arelle_fact_scope_manifest_limit")
    return manifest

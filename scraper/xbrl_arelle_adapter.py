"""Small, offline-only adapter around the official Arelle XBRL processor.

The adapter deliberately does not acquire documents or persist anything.  A
caller supplies a local XBRL/iXBRL document (or its bytes), and receives
plain dictionaries suitable for a subsequent, authenticated ingestion step.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
import os
from pathlib import Path
import tempfile
from typing import Any


class XbrlAdapterError(ValueError):
    """A document is not a supported, consolidated, local XBRL document."""


def _qname_text(qname: Any) -> str | None:
    if qname is None:
        return None
    prefix = getattr(qname, "prefix", None)
    local = getattr(qname, "localName", None)
    namespace = getattr(qname, "namespaceURI", None)
    if prefix and local:
        return f"{prefix}:{local}"
    if local and namespace:
        return f"{{{namespace}}}{local}"
    text = str(qname)
    return text or None


def _context_has_dimension(context: Any) -> str | None:
    """Return the forbidden context component, if present.

    Arelle exposes these as ``context.segment`` and ``context.scenario``.
    Checking the object rather than only explicitMember children also rejects
    typed members, as required by the consolidated-only contract.
    """

    for name in ("segment", "scenario"):
        value = getattr(context, name, None)
        if value is not None:
            return name
    # When a context is only partially schema-validated, some Arelle builds
    # leave the convenience properties unset.  Inspect the context element as
    # a second, namespace-agnostic guard.
    try:
        for element in context.iter():
            local_name = str(getattr(element, "localName", "")).lower()
            if local_name in {"segment", "scenario"}:
                return local_name
    except (AttributeError, TypeError):
        pass
    return None


def _context_period(context: Any) -> dict[str, Any]:
    # Arelle exposes normalized dates directly on ModelContext.  Some older
    # releases expose only the period XML node, so retain that fallback.
    def date_value(value: Any) -> str | None:
        if value is None:
            return None
        return value.isoformat() if hasattr(value, "isoformat") else str(value)

    start = date_value(getattr(context, "startDate", None))
    end = date_value(getattr(context, "endDate", None))
    instant = date_value(getattr(context, "instantDate", None))
    if start is None:
        start = date_value(getattr(context, "startDatetime", None))
        if start and "T" in start:
            start = start.split("T", 1)[0]
    if end is None:
        end = date_value(getattr(context, "endDate", None))
        if end is None:
            end = date_value(getattr(context, "endDatetime", None))
            if end and "T" in end:
                end = end.split("T", 1)[0]
    if instant is None:
        instant = date_value(getattr(context, "instantDatetime", None))
        if instant and "T" in instant:
            instant = instant.split("T", 1)[0]
    if (start is None or end is None) and instant is None:
        raise XbrlAdapterError(
            f"context {getattr(context, 'id', '?')} has unsupported period; "
            "expected start/end or instant"
        )
    return {
        "id": str(getattr(context, "id", "")),
        "period_start": start,
        "period_end": end,
        "instant": instant,
        "consolidated_scope": "consolidated",
    }


def _unit_text(unit: Any) -> str | None:
    if unit is None:
        return None
    measures = getattr(unit, "measures", None)
    if measures:
        numerator, denominator = measures
        num = "*".join(filter(None, (_qname_text(q) for q in numerator)))
        den = "*".join(filter(None, (_qname_text(q) for q in denominator)))
        if den:
            return f"{num}/{den}"
        if num:
            return num
    unit_id = getattr(unit, "id", None)
    return str(unit_id) if unit_id else None


def _numeric_value(fact: Any) -> int | float | Decimal | None:
    value = getattr(fact, "xValue", None)
    if value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _load_model(source: str | os.PathLike[str] | bytes) -> tuple[Any, Any]:
    """Load a local source through Arelle, with network access disabled."""

    if isinstance(source, (str, os.PathLike)):
        source_text = os.fspath(source)
        if source_text.startswith(("http://", "https://", "ftp://")):
            raise XbrlAdapterError("remote URLs are forbidden; provide a local XBRL/iXBRL fixture")
        path = Path(source_text)
        if not path.is_file():
            raise XbrlAdapterError(f"local XBRL document does not exist: {path}")
        load_target = str(path.resolve())
        temporary = None
    elif isinstance(source, bytes):
        temporary = tempfile.NamedTemporaryFile(suffix=".xhtml", delete=False)
        temporary.write(source)
        temporary.close()
        load_target = temporary.name
    else:
        raise TypeError("source must be a local path or bytes")

    try:
        try:
            from arelle import Cntlr
        except ImportError as exc:  # pragma: no cover - exercised without optional dependency
            raise XbrlAdapterError(
                "Arelle is required; install scraper/requirements.txt (arelle-release==2.37.75)"
            ) from exc
        controller = Cntlr.Cntlr(logFileName="logToPrint")
        web_cache = getattr(controller, "webCache", None)
        if web_cache is not None and hasattr(web_cache, "workOffline"):
            web_cache.workOffline = True
        model = controller.modelManager.load(load_target)
        if model is None:
            raise XbrlAdapterError("Arelle could not load the local XBRL document")
        return controller, model
    finally:
        if temporary is not None:
            Path(temporary.name).unlink(missing_ok=True)


def parse_xbrl(source: str | os.PathLike[str] | bytes) -> list[dict[str, Any]]:
    """Parse a local XBRL or inline XBRL document into normalized fact rows.

    Segment/scenario contexts are intentionally unsupported: accepting them
    would silently mix consolidated and dimensional facts in downstream
    financial metrics.  The function raises :class:`XbrlAdapterError` before
    emitting any rows when one is encountered.
    """

    controller, model = _load_model(source)
    try:
        contexts = getattr(model, "contexts", {})
        normalized_contexts: dict[str, dict[str, Any]] = {}
        for context_id, context in contexts.items():
            forbidden = _context_has_dimension(context)
            if forbidden:
                raise XbrlAdapterError(
                    f"context {context_id} contains {forbidden}; "
                    "segment/scenario facts are not supported (consolidated scope required)"
                )
            normalized_contexts[str(context_id)] = _context_period(context)

        rows: list[dict[str, Any]] = []
        for fact in getattr(model, "facts", ()):
            context_id = getattr(fact, "contextID", None)
            if context_id is None or str(context_id) not in normalized_contexts:
                raise XbrlAdapterError(f"fact has unknown contextRef: {context_id!r}")
            decimals_raw = getattr(fact, "decimals", None)
            try:
                decimals: int | str | None = int(decimals_raw) if decimals_raw not in (None, "INF") else decimals_raw
            except (TypeError, ValueError):
                decimals = str(decimals_raw)
            qname = getattr(fact, "qname", None)
            context = normalized_contexts[str(context_id)]
            rows.append(
                {
                    "concept": _qname_text(qname),
                    "value": _numeric_value(fact),
                    "raw_value": str(getattr(fact, "value", "")),
                    "context": context,
                    "context_id": context["id"],
                    "period_start": context["period_start"],
                    "period_end": context["period_end"],
                    "instant": context["instant"],
                    "unit": _unit_text(getattr(fact, "unit", None)),
                    "decimals": decimals,
                    "consolidated_scope": context["consolidated_scope"],
                }
            )
        return rows
    finally:
        close = getattr(controller, "close", None)
        if callable(close):
            close()


__all__ = ["XbrlAdapterError", "parse_xbrl"]

#!/usr/bin/env python3
"""Credential-free systemd socket boundary for candidate document parsing."""

import json
import datetime
import os
import socket
import subprocess
import sys
import tempfile
import time

MAX_HEADER = 1024
MAX_BYTES = 50 * 1024 * 1024
MAX_OUTPUT = 2 * 1024 * 1024
REQUEST_TIMEOUT_SECONDS = 5
PARSER_TIMEOUT_SECONDS = 25
EXTENDED_OFFICIAL_TIMEOUT_SECONDS = 142
EXPECTED_ARELLE_VERSION = "2.44.7"
EXPECTED_TAXONOMY_SHA256 = "4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869"
OFFICIAL_TAXONOMY_PATH = "/opt/stockinsider/runtime/candidate-financial-parser/taxonomy/current"
HISTORICAL_TAXONOMY_SHA256 = "8b1910ec2dff01b91227255c82dd92385d4db6664b3a5a638ac7086ebe7dad17"
HISTORICAL_TAXONOMY_PATH = "/opt/stockinsider/runtime/candidate-financial-parser/taxonomy/tifrs-20200630-8b1910ec2dff"


def registered_taxonomy(period_end):
    if (period_end is not None and "2020-06-30" <= period_end <= "2025-12-31"
            and period_end[4:] in ("-03-31", "-06-30", "-09-30", "-12-31")):
        return HISTORICAL_TAXONOMY_PATH, HISTORICAL_TAXONOMY_SHA256
    return OFFICIAL_TAXONOMY_PATH, EXPECTED_TAXONOMY_SHA256


def receive_request(connection):
    deadline = time.monotonic() + REQUEST_TIMEOUT_SECONDS

    def read(count):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("parser_socket_request_timeout")
        connection.settimeout(remaining)
        return connection.recv(count)

    header = bytearray()
    while b"\n" not in header:
        chunk = read(min(256, MAX_HEADER + 1 - len(header)))
        if not chunk or len(header) + len(chunk) > MAX_HEADER:
            raise ValueError("parser_socket_header_invalid")
        header.extend(chunk)
    raw_header, remainder = bytes(header).split(b"\n", 1)
    request = json.loads(raw_header)
    size = int(request.get("byteLength", 0))
    format_name = request.get("format")
    digest = request.get("sha256")
    if size < 1 or size > MAX_BYTES or format_name not in ("pdf", "html", "xbrl"):
        raise ValueError("parser_socket_request_invalid")
    if not isinstance(digest, str) or len(digest) != 64:
        raise ValueError("parser_socket_request_invalid")
    entity = request.get("expectedEntity")
    period_end = request.get("expectedPeriodEnd")
    if entity is not None or period_end is not None:
        if (not isinstance(entity, str) or not entity.isascii() or not entity.isdigit()
                or not 4 <= len(entity) <= 6 or not isinstance(period_end, str)
                or datetime.date.fromisoformat(period_end).isoformat() != period_end):
            raise ValueError("parser_socket_context_invalid")
    profile = request.get("profile")
    if "profile" in request and (profile != "extended-official" or format_name == "pdf" or entity is None):
        raise ValueError("parser_socket_profile_invalid")
    payload = bytearray(remainder)
    while len(payload) < size:
        chunk = read(min(64 * 1024, size - len(payload)))
        if not chunk:
            raise ValueError("parser_socket_payload_truncated")
        payload.extend(chunk)
    if len(payload) != size:
        raise ValueError("parser_socket_payload_invalid")
    connection.settimeout(REQUEST_TIMEOUT_SECONDS)
    return request, bytes(payload)


def serve(connection):
    request, payload = receive_request(connection)
    parser_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "candidate_financial_document_parser.py")
    # DynamicUser has no writable home. Arelle must not fall back to /.config;
    # give each request an isolated, automatically removed config directory.
    # This remains inside systemd's PrivateTmp and does not expose credentials.
    with tempfile.TemporaryDirectory(prefix="stockinsider-arelle-") as config_home:
        command = [sys.executable, parser_script, "--format", request["format"], "--sha256", request["sha256"], "--max-bytes", str(MAX_BYTES)]
        if request.get("expectedEntity") is not None:
            command.extend(["--expected-entity", request["expectedEntity"], "--expected-period-end", request["expectedPeriodEnd"]])
        expected_taxonomy_sha256 = None
        if request["format"] in ("html", "xbrl"):
            taxonomy_path, expected_taxonomy_sha256 = registered_taxonomy(request.get("expectedPeriodEnd"))
            identity_path = os.path.join(taxonomy_path, ".archive-sha256")
            if not os.path.isdir(taxonomy_path) or not os.path.isfile(identity_path):
                raise ValueError("official_taxonomy_unavailable")
            with open(identity_path, "r", encoding="ascii") as stream:
                taxonomy_sha256 = stream.read(65).strip()
            if taxonomy_sha256 != expected_taxonomy_sha256:
                raise ValueError("official_taxonomy_identity_mismatch")
            command.extend(["--taxonomy-path", taxonomy_path, "--taxonomy-sha256", taxonomy_sha256])
        extended = request.get("profile") == "extended-official"
        if extended:
            command.append("--extended-official-validation")
        completed = subprocess.run(
            command,
            input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=EXTENDED_OFFICIAL_TIMEOUT_SECONDS if extended else PARSER_TIMEOUT_SECONDS, check=False,
            env={"LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "PYTHONNOUSERSITE": "1", "PYTHONHASHSEED": "0",
                 "XDG_CONFIG_HOME": config_home, "TMPDIR": config_home,
                 "NO_PROXY": "*", "no_proxy": "*", "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"},
        )
    if completed.returncode != 0 or not completed.stdout or len(completed.stdout) > MAX_OUTPUT:
        raise ValueError("parser_subprocess_failed")
    parsed = json.loads(completed.stdout)
    if request["format"] in ("html", "xbrl") and (
        parsed.get("runtimeVersion") != EXPECTED_ARELLE_VERSION
        or parsed.get("taxonomySha256") != expected_taxonomy_sha256
    ):
        raise ValueError("parser_runtime_identity_mismatch")
    connection.sendall(completed.stdout.rstrip(b"\n") + b"\n")


def main():
    listener = socket.fromfd(3, socket.AF_UNIX, socket.SOCK_STREAM)
    while True:
        connection, _ = listener.accept()
        with connection:
            try:
                serve(connection)
            except (ConnectionError, TimeoutError):
                # A timed-out or disconnected caller cannot take down the listener.
                continue
            except Exception as error:
                response = json.dumps({"error": str(error)[:160]}, separators=(",", ":")).encode("utf-8")
                try:
                    connection.sendall(response + b"\n")
                except (ConnectionError, TimeoutError):
                    continue


if __name__ == "__main__":
    main()

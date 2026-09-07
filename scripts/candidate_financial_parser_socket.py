#!/usr/bin/env python3
"""Credential-free systemd socket boundary for candidate document parsing."""

import json
import os
import socket
import subprocess
import sys

MAX_HEADER = 1024
MAX_BYTES = 50 * 1024 * 1024
MAX_OUTPUT = 2 * 1024 * 1024


def receive_request(connection):
    header = bytearray()
    while b"\n" not in header:
        chunk = connection.recv(min(256, MAX_HEADER + 1 - len(header)))
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
    payload = bytearray(remainder)
    while len(payload) < size:
        chunk = connection.recv(min(64 * 1024, size - len(payload)))
        if not chunk:
            raise ValueError("parser_socket_payload_truncated")
        payload.extend(chunk)
    if len(payload) != size:
        raise ValueError("parser_socket_payload_invalid")
    return request, bytes(payload)


def serve(connection):
    request, payload = receive_request(connection)
    parser_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "candidate_financial_document_parser.py")
    completed = subprocess.run(
        [sys.executable, parser_script, "--format", request["format"], "--sha256", request["sha256"], "--max-bytes", str(MAX_BYTES)],
        input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=25, check=False,
        env={"LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "PYTHONNOUSERSITE": "1", "PYTHONHASHSEED": "0",
             "NO_PROXY": "*", "no_proxy": "*", "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"},
    )
    if completed.returncode != 0 or not completed.stdout or len(completed.stdout) > MAX_OUTPUT:
        raise ValueError("parser_subprocess_failed")
    connection.sendall(completed.stdout.rstrip(b"\n") + b"\n")


def main():
    listener = socket.fromfd(3, socket.AF_UNIX, socket.SOCK_STREAM)
    while True:
        connection, _ = listener.accept()
        with connection:
            try:
                serve(connection)
            except Exception as error:
                response = json.dumps({"error": str(error)[:160]}, separators=(",", ":")).encode("utf-8")
                connection.sendall(response + b"\n")


if __name__ == "__main__":
    main()

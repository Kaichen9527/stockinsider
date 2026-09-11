#!/usr/bin/env bash
set -euo pipefail
# Run after activating a reviewed release. Only the two credential-free parser
# scripts enter the DynamicUser-readable directory, never the application's
# secrets, release contents, or node_modules. Existing virtualenv is preserved.
test "$(id -u)" = 0
test -x /opt/stockinsider/runtime/candidate-financial-parser/bin/python
test -d /opt/stockinsider/runtime/candidate-financial-parser/taxonomy/current
test ! -L /opt/stockinsider/runtime/candidate-financial-parser/taxonomy/current || test -d "$(readlink -f /opt/stockinsider/runtime/candidate-financial-parser/taxonomy/current)"
if systemctl is-active --quiet stockinsider-financial-parser.service; then
  echo 'Stop the parser service before replacing parser code; leave the web service running.' >&2
  exit 1
fi
install -d -m 0755 -o root -g root /opt/stockinsider/runtime/candidate-financial-parser/app
for parser_file in candidate_financial_parser_socket.py candidate_financial_document_parser.py; do
  test -f "/opt/stockinsider/current/scripts/$parser_file"
  install -m 0644 -o root -g root "/opt/stockinsider/current/scripts/$parser_file" "/opt/stockinsider/runtime/candidate-financial-parser/app/$parser_file"
done
install -d -m 0750 -o root -g stockinsider /run/stockinsider

import json, pathlib, sys
text = pathlib.Path(sys.argv[1]).read_text()
decoder = json.JSONDecoder()
records = []
while text.strip():
    value, end = decoder.raw_decode(text.lstrip())
    records.append(value)
    text = text.lstrip()[end:]
assert records and all(isinstance(row, dict) for row in records), 'json_records_required'
assert all(set(row) == {'shellProbe'} for row in records[:-1]), 'unexpected_intermediate_record'
summary = records[-1]
assert set(summary) == {'scope', 'count', 'results', 'formalApproval'}, 'closed_summary_required'
assert summary['scope'] == 'isolated candidate components only; no production procedure or approved activation executed'
assert summary['formalApproval'] is False and summary['count'] == 35, 'exact_scope_count_required'
rows = summary['results']
assert isinstance(rows, list) and len(rows) == 35, 'all_groups_required'
assert all(set(row) == {'name', 'status'} and isinstance(row['name'], str) and row['name'] and row['status'] == 'PASS' for row in rows), 'all_groups_must_pass'
assert len({row['name'] for row in rows}) == 35, 'unique_groups_required'
assert len(records[:-1]) == 10, 'all_dummy_shell_ordering_records_required'
print(json.dumps({'groups': 35, 'passed': 35, 'failed': 0, 'dummyShellRecords': 10, 'formalApproval': False}))
